import { StyleOption, badgen } from 'badgen';
import {
	Request as WorkerRequest,
	D1Database,
} from '@cloudflare/workers-types/experimental';

/**
 * Environment variables type definition.
 */
export interface Env {
	ViewCounter: D1Database;
}

export default {
	/**
	 * Fetches the view count and generates an SVG badge.
	 * @param request The incoming request.
	 * @param env The environment variables.
	 * @returns A response containing the SVG badge.
	 */
	async fetch(request: WorkerRequest, env: Env): Promise<Response> {
		const { searchParams } = new URL(request.url);
		const referer = request.headers.get('referer');
		let id = searchParams.get('r') || '/';
		if (referer && id === '/') {
			// Extract the path from the referer URL
			const { host, pathname } = new URL(referer);
			id = host + pathname;
		}

		// Step the count
		let count: number | null = await getCountFromD1(env, id);
		count = await stepCount(id, count, env);
		console.log('Count', count);

		// Get the query parameters
		const params = readQueryParams(searchParams);
		console.log('Params', params);

		// Generate the svg string
		const svgString = badgen({
			...params,
			status: count.toString()
		});
		console.log('SVG', svgString);

		return new Response(svgString, {
			headers: {
				'content-type': 'image/svg+xml;charset=utf-8',
				'access-control-allow-origin': '*',
				'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
			}
		});
	}
};

/**
 * Gets the current count from the ViewCounter.
 * @param env The environment variables.
 * @returns The current count, or null if it doesn't exist.
 */
const getCountFromD1 = async (env: Env, id: string): Promise<number | null> =>
	await env.ViewCounter.prepare('SELECT view_count FROM view_counter WHERE id = ?')
		.bind(id)
		.first('view_count');

/**
 * Increments the count and updates the ViewCounter.
 * @param id The ID of the view counter.
 * @param count The current count.
 * @param env The environment variables.
 * @returns The new count.
 */
const stepCount = async (id: string, count: number | null, env: Env): Promise<number> => {
	// If the value is null, insert a new record
	if (!count) {
		const result = await env.ViewCounter.prepare(
			'INSERT INTO view_counter (id, view_count) VALUES (?, ?)'
		)
			.bind(id, 1)
			.run();
		console.log('Insert result', result);
	} else {
		// Step the count in the database
		const result = await env.ViewCounter.prepare(
			'UPDATE view_counter SET view_count = view_count + 1 WHERE id = ?'
		)
			.bind(id)
			.run();
		console.log('Update result', result);
	}

	return (count || 0) + 1;
};

/**
 * Reads the query parameters from the request.
 * @param searchParams URLSearchParams
 * @returns The query parameters.
 */
const readQueryParams: (
	searchParams: URLSearchParams
) => {
	label: string;
	labelColor: string;
	color: string;
	style: StyleOption;
	scale: number;
} = searchParams => {
	return {
		label: searchParams.get('label') || 'Views',
		labelColor: searchParams.get('labelColor') || '555',
		color: searchParams.get('color') || 'blue',
		style: searchParams.get('style') === 'classic' ? 'classic' : 'flat',
		scale: parseFloat(searchParams.get('scale') || '1')
	};
};
