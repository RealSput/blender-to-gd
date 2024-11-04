import '@g-js-api/g.js';
import fs from 'fs';
extract(obj_props);

await $.exportConfig({
	type: 'live_editor',
	options: { info: true, reencrypt: false }
});

function rgb2hsv(r, g, b) {
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

let redC = unknown_c();
redC.set(rgb(255, 0, 0));
let shadowC = unknown_c();
shadowC.set([0, 0, 0, 0.6])

let data = JSON.parse(fs.readFileSync('./vertex_data.json').toString());
let frames = data.animation;
let shadows = data.shadows;

let vec = (x, y) => ({ x: x, y: y });
let get_angle = (v) => Math.atan2(v.y, v.x);

let rotate_around = (point, center, angle) => {
    let s = Math.sin(angle);
    let c = Math.cos(angle);
    let x = point.x - center.x;
    let y = point.y - center.y;
    let x_new = x * c - y * s;
    let y_new = x * s + y * c;
    return vec(x_new + center.x, y_new + center.y);
}

let get_distance = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
let rad_to_deg = (rad) => rad * (180 / Math.PI);

let triangle = (a, b, c) => {
    let pos = vec((a.x + b.x) / 2, (a.y + b.y) / 2)
    let scale = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) / 30 / Math.sqrt(2)
    let angle = get_angle(vec(b.x - a.x, b.y - a.y))
    let newC = rotate_around(c, pos, Math.PI - (angle + Math.PI / 4))
    let ac = vec(newC.x - pos.x, newC.y - pos.y)
    let y_offset = ac.x / scale - 15
    let x_offset = ac.y / scale - 15
	let [x, y] = [pos.x, pos.y];
	angle = -(angle - Math.PI / 4);
	let ad = vec(x_offset + 30, y_offset)
    let bd = vec(x_offset, y_offset + 30)
    let angle_vertical = get_angle(ad) + angle
    let angle_horizontal = get_angle(bd) - Math.PI / 2 + angle
    let x_scale = (scale * get_distance(ad)) / 30 + 0.01
    let y_scale = (scale * get_distance(bd)) / 30 + 0.01
    return object({
        OBJ_ID: 693,
        X: x,
        Y: y,
        155: true,
        SCALE_X: x_scale,
        SCALE_Y: y_scale,
        PERSPECTIVE_X: rad_to_deg(angle_horizontal),
        PERSPECTIVE_Y: rad_to_deg(angle_vertical)
    })
}

function triangle_basic(x, y, y_offset, x_offset, angle, scaleup) {
    let ad = vec(x_offset + 30, y_offset)
    let bd = vec(x_offset, y_offset + 30)

    let angle_vertical = get_angle(ad) + angle
    let angle_horizontal = get_angle(bd) - Math.PI / 2 + angle
    let x_scale = (scaleup * get_distance(ad)) / 30 + 0.01
    let y_scale = (scaleup * get_distance(bd)) / 30 + 0.01
    return object({
        OBJ_ID: 693,
        X: x,
        Y: y,
        155: true,
        SCALE_X: x_scale,
        SCALE_Y: y_scale,
        PERSPECTIVE_X: rad_to_deg(angle_horizontal),
        PERSPECTIVE_Y: rad_to_deg(angle_vertical)
    })
}
let frameGroup = unknown_g();
let framesCenter = unknown_g();

let res = frames.shift();
let scaling = 1/4;
frames.forEach((vertexData, currFrame) => {
	let allFaces = vertexData.faces.map(x => {
		return x.map(y => {
			let d = vertexData.vertices[y];
			return d;
		});
	});

	let buffers = vertexData.buffers;
	let mirror = false;
	
	if (currFrame == 0) {
		object({
			OBJ_ID: 211,
			X: (res[0] * scaling) / 2,
			Y: -(res[1] * scaling) / 2,
			GROUPS: framesCenter
		}).add()
	}

	allFaces.forEach((face, i) => {
		face = face.map(y => {
			y = y.slice(0, -1);
			if (mirror) {
				let old = [y[1]][0];
				y[1] = -y[1];
				y[1] += old * 2;
			}
			y[0] -= currFrame * 1500
			y[1] -= res[1]
			y[1] += currFrame * 3000
			y = y.map(x => x * scaling);
			return y;
		}).map(x => ({ x: x[0], y: x[1] }));
		let t = triangle(...face).with(HVS_ENABLED, 1).with(HVS, rgb2hsv(...vertexData.colors[i])).with(COLOR, redC).with(Z_ORDER, buffers[i]).with(EDITOR_LAYER_1, currFrame + 1).with(GROUPS, frameGroup);
		t.add();
	});
});

console.log(shadows)
if (shadows.length > 0) {
	shadows.forEach((shadow, currFrame) => {
		shadow.triangles.forEach(tri => {
			let vertices = tri.map(x => {
				let verts = shadow.vertices[x];
				return vec(...verts.map(x => x * scaling))
			});
			let t = triangle(...vertices).with(Z_ORDER, -100).with(COLOR, shadowC).with(GROUPS, frameGroup);
			t.obj_props.Y -= res[1] * scaling;
			t.obj_props.X -= (currFrame * 1500) * scaling;
			t.obj_props.Y += (currFrame * 3000) * scaling;
			t.obj_props.Y += 15 * 3;
			t.add();
		})
	});
}

/*
let nextFrame = trigger_function(() => {
	frameGroup.move(0, -250);
});
let loop = sequence([
	[nextFrame, frames.length]
]);
*/
