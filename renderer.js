require('@g-js-api/g.js');
extract(obj_props);

const fs = require('fs');
const OBJFile = require('obj-file-parser');
const MTLFile = require('mtl-file-parser');
const path = require('path');

let dump = [];
const divideArray = (arr, numSubarrays) => Array.from({
    length: numSubarrays
}, (_, i) => arr.slice(i * Math.ceil(arr.length / numSubarrays), (i + 1) * Math.ceil(arr.length / numSubarrays)));
let add_all = (g) => g.objsf.forEach(x => $.add(x));

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (a) => {
    const len = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    return {
        x: a.x / len,
        y: a.y / len,
        z: a.z / len
    };
};
const avr = (...v) => v.reduce((sum, val) => sum + val, 0) / v.length;

const stripUnneededStatements = (mtlString, statementsToOmit) => {
    const regexPatterns = statementsToOmit.map(statement => new RegExp(`^${statement}\\s+[\\d.]+(\\s+[\\d.]+)?(\\s+[\\d.]+)?`, 'gm'));

    let strippedString = mtlString;
    regexPatterns.forEach(regex => {
        strippedString = strippedString.replace(regex, '');
    });

    return strippedString.split(/\r?\n/).filter(line => line.trim() !== '').join('\n');
};
const rgb2hsv = (r, g, b) => {
    let rabs, gabs, babs, rr, gg, bb, h, s, v, diff, diffc, percentRoundFn;
    rabs = r / 255;
    gabs = g / 255;
    babs = b / 255;
    v = Math.max(rabs, gabs, babs),
    diff = v - Math.min(rabs, gabs, babs);
    diffc = c => (v - c) / 6 / diff + 1 / 2;
    percentRoundFn = num => Math.round(num * 100) / 100;
    if (diff == 0) {
        h = s = 0;
    } else {
        s = diff / v;
        rr = diffc(rabs);
        gg = diffc(gabs);
        bb = diffc(babs);

        if (rabs === v) {
            h = bb - gg;
        } else if (gabs === v) {
            h = (1 / 3) + rr - bb;
        } else if (babs === v) {
            h = (2 / 3) + gg - rr;
        }
        if (h < 0) {
            h += 1;
        }else if (h > 1) {
            h -= 1;
        }
    }
    let [hue, saturation, brightness] = [Math.round(h * 360), percentRoundFn(s * 100) / 100, percentRoundFn(v * 100) / 100]
	return `${hue}a${saturation}a${brightness}a0a0`;
}
const fpsToSeconds = fps => (1 / fps).toFixed(4);

let black_color = unknown_c();
black_color.set([0, 0, 0], 0);
let lock_group = unknown_g();
let default_color = unknown_c();
let uc = unknown_c();
let invis_color = unknown_c();
invis_color.set(rgba(0, 0, 0, 0), 0, true);
let red_color = unknown_c();
red_color.set([255, 0, 0]);

let colors_u, frame_delay;
let cull_op = false;
let intensity_op = 1;
let vert_colors = null;
let vc_groups = {};

let calculateSign = (face) => {
    const ab = [face[1][0] - face[0][0], face[1][1] - face[0][1]];
    const ac = [face[2][0] - face[0][0], face[2][1] - face[0][1]]; 

    return ab[0] * ac[1] - ac[0] * ab[1];
}

let obj_to_grad = (material, str, offset_x = 0, offset_y = 0, add = true, old_pos, fid, light_pos, scale) => {
    material = stripUnneededStatements(material, ['Ns', 'Ke', 'Ni'])

    let objsf = [];
    const $obj = new OBJFile(str).parse().models[0];
	faces_am = $obj.faces.length;
    const $mtl = new MTLFile(material).parse();
    let ggroups = {};
    let curr_vert = 0;
    let ord = -1000;
    let grad_id = -50000;
    if (!colors_u) {
        colors_u = {}

        for (let i of $mtl) {
            let color = [i.Kd.red * 255, i.Kd.green * 255, i.Kd.blue * 255].map(x => Math.floor(x));
            let cg = unknown_c();
            cg.set(color);
            colors_u[i.name] = cg;
        }
    }

    const vertex = (x, y) => {
        x /= scale; y /= scale;
        if (add || !old_pos) {
            const gr = unknown_g();
            ggroups[curr_vert] = [gr, x, y];
            let o = {
                OBJ_ID: 1764,
                X: x + offset_x,
                Y: y + offset_y,
                GROUPS: [1, gr, lock_group],
                COLOR: invis_color
            };
            old_pos ? $.add(o) : objsf.push(o)
            curr_vert++;
            return gr;
        }
        let real_diff = [x - old_pos[curr_vert][1], y - old_pos[curr_vert][2]]
        let diff = [real_diff[0] + offset_x, real_diff[1] + offset_y]
        ggroups[curr_vert] = [old_pos[curr_vert][0], x, y];
		old_pos[curr_vert][0].move(...diff, frame_delay, NONE, 2, 1, 1, false, false);
        curr_vert++;
        return old_pos[curr_vert - 1][0];
    };
    const quad = (bl, br, tl, tr, col = 1, bgr = 1, layer, col2 = col, addBlend = false, customHSV = false) => {
        const hsv = customHSV ? customHSV : `0a1a${bgr}a0a0`;
        const o = {
            OBJ_ID: 2903,
            Y: 100 + (grad_id + 10000) * 10 * 3,
            X: fid * 25 * 3,
            ORD: ord,
            GR_BL: bl,
            GR_BR: br,
            GR_TL: tl,
            GR_TR: tr,
            GR_ID: grad_id,
            COLOR: col,
            COLOR_2: col2,
			GR_BLENDING: addBlend ? 1 : 0,
            PREVIEW_OPACITY: 1,
            COLOR_2_HVS_ENABLED: true,
            COLOR_2_HVS: hsv,
            GR_VERTEX_MODE: true,
            GR_LAYER: layer
        };
        add ? $.add(o) : objsf.push(o);
        ord++;
        grad_id++;
    };
    const tri = (v1, v2, v3, col = 1, bgr = 1, layer, col2 = col, addBlend = false, customHSV = false) => quad(v1, v2, v3, v3, col, bgr, layer, col2, addBlend, customHSV); 
    const vertexToLight = normalize({
        x: light_pos[0],
        y: light_pos[1],
        z: light_pos[2]
    });
    const calcBgrForNormal = (normal, intensity) => Math.min(1, Math.max(0, dot(normal, vertexToLight) * intensity));

    const centerPos = {
        x: 200,
        y: 150
    };
    let vertexToGid = {};

    for (let i = 0; i < $obj.vertices.length; i++) {
        const v = $obj.vertices[i];
        vertexToGid[i + 1] = vertex(centerPos.x + v.x * 100, centerPos.y + v.y * 100);
    }

    let verticesLight = {};
    let vertexNormals = {};
    for (let i = 0; i < $obj.vertexNormals.length; i++) {
        const normal = $obj.vertexNormals[i];
        if (!normal) continue;

        verticesLight[i] = calcBgrForNormal(normal, intensity_op);
		vertexNormals[i] = normal;
    }

    let asf = [];
    for (let f of $obj.faces) {
        const face_color = f.material == '' ? default_color : colors_u[f.material];
        const vs = f.vertices;
		let face_verts = vs.map(x => [$obj.vertices[x.vertexIndex - 1].x, $obj.vertices[x.vertexIndex - 1].y])

        const l1 = verticesLight[vs[0].vertexNormalIndex - 1];
        const l2 = verticesLight[vs[1].vertexNormalIndex - 1];
        const l3 = verticesLight[vs[2].vertexNormalIndex - 1];
		
        const v1 = vertexToGid[vs[0].vertexIndex];
        const v2 = vertexToGid[vs[1].vertexIndex];
        const v3 = vertexToGid[vs[2].vertexIndex];
		
		const cameraPosition = { x: 0, y: 0, z: -50 };
		const culled = cull_op ? calculateSign(face_verts) < 0 : false;
        let depth = avr($obj.vertices[vs[0].vertexIndex - 1].z, $obj.vertices[vs[1].vertexIndex - 1].z, $obj.vertices[vs[2].vertexIndex - 1].z);
		let vertex_cols_curr = []; // where all 3 vertex colors of the face will be stored
		// loops through all 3 vertices
		let add_gr = [{vs: [v3, v1, v2], depth, c1: black_color, c2: !vert_colors ? face_color : red_color, bgr: !vert_colors ? l1 : 1, blending: false, culled}, {vs: [v1, v2, v3], depth, c1: black_color, c2: !vert_colors ? face_color : red_color, bgr: !vert_colors ? l2 : 1, blending: true, culled}, {vs: [v2, v3, v1], depth, c1: black_color, c2: !vert_colors ? face_color : red_color, bgr: !vert_colors ? l3 : 1, blending: true, culled}];
		add_gr = add_gr.map((x, i) => {
			if (vert_colors) {
				x.hsvc = rgb2hsv(...vert_colors[vs[i].vertexIndex])
			};
			return x
		})
		asf.push(...add_gr);
    }

    asf = asf.sort((a, b) => a.depth - b.depth);

    let lrs = 0;
    let lre = 13;
    asf = divideArray(asf, lre - lrs);
    let layer = lrs;
    for (let a of asf) {
        for (let f of a) {
            if (!f.culled) tri(f.vs[0], f.vs[1], f.vs[2], f.c1, f.bgr, layer, f.c2, f.blending, f.hsvc);
        }
        layer++;
    }

    return add ? ggroups : {
        objsf,
        ggroups
    };
};

module.exports = async (config) => {
	// configuration start
	let light_pos = config.light_pos ?? [-0.5, 1, 0.5] // position of light (x, y, z)
	let file_path = config.file_name; // path of JSON input
	let pos = config.pos ?? [-40, -60]; // offset of rendered scene, xy coordinates
	let lock = config.lock ?? false; // whether the scene should be locked to player X or not
	let loop = config.loop ?? false; // whether animation should loop forever or not
	let fps = config.fps ?? 24; // frames per sec
	let scale = config.scale ?? 1;
	cull_op = config.cull_faces ?? cull_op
	intensity_op = config.intensity ?? intensity_op
	// configuration end
	
	frame_delay = fpsToSeconds(fps);

	let readFile = (filename) => {
		return new Promise((resolve) => {
			let output = [];

			const readStream = fs.createReadStream(filename);

			readStream.on('data', function(chunk) {
			  output.push(chunk)
			});

			readStream.on('end', function() {
			  resolve(Buffer.concat(output).toString())
			});
		})
	}

	if (lock) lock_group.lock_to_player(true, false);
	let file = await readFile(file_path);
	let objs = JSON.parse(file);
	let materials = objs[0];
	if (objs[3] !== 0) vert_colors = objs[3];
	objs = objs[1]

	let fid = 0;
	let a = obj_to_grad(materials, objs[0], ...pos, false, null, fid, light_pos, scale);
	add_all(a);
	fid++;
	if (objs.length > 1) {
		wait(1);
		let ggr = a.ggroups;
		let b = obj_to_grad(materials, objs[1], 0, 0, false, ggr, fid, light_pos, scale);
		b.objsf.forEach(x => $.add(x.obj ? x.obj : x));
		if (loop) {
			let ca = counter(0);
			while_loop(equal_to(ca, 0), () => {
				for (let frame of objs.slice(1)) {
					fid++;
					b = obj_to_grad(materials, frame, 0, 0, false, ggr, fid, light_pos, scale);
					b.objsf.forEach(x => $.add(x.obj ? x.obj : x));
					ggr = b.ggroups;
					wait(frame_delay)
				}
				fid = 0;
				b = obj_to_grad(materials, objs[0], 0, 0, false, ggr, fid, light_pos, scale);
				b.objsf.forEach(x => $.add(x.obj ? x.obj : x));
				ggr = b.ggroups;
			})
		} else {
			for (let frame of objs.slice(1)) {
				fid++;
				b = obj_to_grad(materials, frame, 0, 0, false, ggr, fid, light_pos, scale);
				b.objsf.forEach(x => $.add(x.obj ? x.obj : x));
				ggr = b.ggroups;
				wait(frame_delay)
			}
			fid = 0;
		}
	}
	await $.exportToSavefile({
		info: true,
		level_name: config.level
	});
}
