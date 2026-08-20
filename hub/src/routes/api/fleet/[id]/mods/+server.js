import { json } from '@sveltejs/kit';
import { list_mods, install_mod } from '$lib/server/mods.js';

export async function GET({ params }) {
	try {
		const result = await list_mods(params.id);
		return json(result, { status: result.ok ? 200 : 404 });
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 500 });
	}
}

export async function POST({ params, request }) {
	try {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!file || typeof file === 'string') {
			return json({ ok: false, error: 'file upload required' }, { status: 400 });
		}

		const name = formData.get('name') ? String(formData.get('name')) : undefined;
		const enable = formData.get('enable') !== 'false';
		const kind_raw = formData.get('kind') ? String(formData.get('kind')) : undefined;
		const kind = (kind_raw === 'ue4ss' || kind_raw === 'logic-pak' || kind_raw === 'asset-pak')
			? kind_raw
			: undefined;

		const arrayBuffer = await file.arrayBuffer();
		const result = await install_mod(params.id, {
			filename: file.name,
			name,
			enable,
			kind,
			bytes: arrayBuffer,
		});

		return json(result);
	} catch (e) {
		return json({ ok: false, error: String(e?.message || e) }, { status: 400 });
	}
}
