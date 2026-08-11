const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const WORKSPACE = __dirname;

const initPath = path.join(WORKSPACE, 'res/init/init.png');

const transitions = [
    { name: 'left',       target: 'res/move/left/left.png',             outDir: 'res/move/left' },
    { name: 'right',      target: 'res/move/right/right.png',           outDir: 'res/move/right' },
    { name: 'up',         target: 'res/move/up/up.png',                 outDir: 'res/move/up' },
    { name: 'down',       target: 'res/move/down/down.png',             outDir: 'res/move/down' },
    { name: 'left_up',    target: 'res/move/left_up/left_up.png',       outDir: 'res/move/left_up' },
    { name: 'left_down',  target: 'res/move/left_down/left_down.png',   outDir: 'res/move/left_down' },
    { name: 'right_up',   target: 'res/move/right_up/right_up.png',     outDir: 'res/move/right_up' },
    { name: 'right_down', target: 'res/move/right_down/right_down.png', outDir: 'res/move/right_down' },
    { name: 'sit_back',   target: 'res/rest/sit_back/sit_back.png',     outDir: 'res/rest/sit_back' },
];

/**
 * 加载图片为RGBA原始像素
 */
async function loadRaw(imgPath) {
    const { data, info } = await sharp(imgPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { pixels: new Uint8ClampedArray(data), info };
}

/**
 * 在预乘alpha空间做像素插值（避免半透明边缘发黑/出现鬼影）
 * a, b: Uint8ClampedArray (RGBA原始像素)
 * t: 混合比例，0=全a，1=全b
 * 返回新的Uint8ClampedArray
 */
function blendPremultiplied(a, b, t) {
    const len = a.length;
    const out = new Uint8ClampedArray(len);
    const t0 = 1 - t;

    for (let i = 0; i < len; i += 4) {
        const aA = a[i + 3] / 255;
        const bA = b[i + 3] / 255;

        // 预乘RGB
        const aR = a[i]     * aA;
        const aG = a[i + 1] * aA;
        const aB = a[i + 2] * aA;

        const bR = b[i]     * bA;
        const bG = b[i + 1] * bA;
        const bB = b[i + 2] * bA;

        // 在预乘空间线性插值
        const pR = aR * t0 + bR * t;
        const pG = aG * t0 + bG * t;
        const pB = aB * t0 + bB * t;
        const pA = aA * t0 + bA * t;

        // 反预乘（还原为straight alpha）
        if (pA > 0.001) {
            out[i]     = Math.round(pR / pA);
            out[i + 1] = Math.round(pG / pA);
            out[i + 2] = Math.round(pB / pA);
            out[i + 3] = Math.round(pA * 255);
        } else {
            out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
        }
    }
    return out;
}

/**
 * 保存像素为PNG
 */
async function savePng(pixels, info, outPath) {
    await sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
}

/**
 * 按用户指定的二分递归策略生成5帧：
 *   帧3 = blend(init, target)       中点
 *   帧2 = blend(init, frame3)       init与3的中点
 *   帧4 = blend(frame3, target)     3与target的中点
 *   帧1 = blend(init, frame2)       init与2的中点
 *   帧5 = blend(frame4, target)     4与target的中点
 *
 * 动画播放顺序：init -> 1 -> 2 -> 3 -> 4 -> 5 -> target
 */
async function generateFrames(initRaw, targetRaw, name, outDir) {
    const absOutDir = path.join(WORKSPACE, outDir);
    if (!fs.existsSync(absOutDir)) fs.mkdirSync(absOutDir, { recursive: true });

    const init = initRaw.pixels;
    const target = targetRaw.pixels;
    const info = initRaw.info;

    // 二分递归生成
    const f3 = blendPremultiplied(init, target, 0.5);        // 50%
    const f2 = blendPremultiplied(init, f3, 0.5);           // 25%
    const f4 = blendPremultiplied(f3, target, 0.5);         // 75%
    const f1 = blendPremultiplied(init, f2, 0.5);           // 12.5%
    const f5 = blendPremultiplied(f4, target, 0.5);         // 87.5%

    const frames = [
        { idx: 1, pixels: f1, t: 0.125 },
        { idx: 2, pixels: f2, t: 0.25 },
        { idx: 3, pixels: f3, t: 0.5 },
        { idx: 4, pixels: f4, t: 0.75 },
        { idx: 5, pixels: f5, t: 0.875 },
    ];

    for (const f of frames) {
        const outPath = path.join(absOutDir, `${f.idx}_${name}.png`);
        await savePng(f.pixels, info, outPath);
    }

    // 计算与init/target的差异，验证确实是中间帧
    const diffInit = avgPixelDiff(f3, init, info);
    const diffTarget = avgPixelDiff(f3, target, info);
    console.log(`  ${name.padEnd(12)}: 帧1(12.5%)→帧2(25%)→帧3(50%)→帧4(75%)→帧5(87.5%)`);
    console.log(`               帧3与init差异=${diffInit.toFixed(1)}, 帧3与target差异=${diffTarget.toFixed(1)}`);
}

/**
 * 计算两帧之间的平均像素差异（验证中间性）
 */
function avgPixelDiff(a, b, info) {
    let sum = 0, count = 0;
    for (let i = 0; i < a.length; i += 4) {
        // 只比较有内容的像素（alpha>10）
        if (a[i+3] > 10 || b[i+3] > 10) {
            const dr = a[i] - b[i];
            const dg = a[i+1] - b[i+1];
            const db = a[i+2] - b[i+2];
            const da = a[i+3] - b[i+3];
            sum += Math.sqrt(dr*dr + dg*dg + db*db + da*da);
            count++;
        }
    }
    return count > 0 ? sum / count : 0;
}

async function cleanupOldFrames() {
    const dirs = [
        'res/move/left', 'res/move/right', 'res/move/up', 'res/move/down',
        'res/move/left_up', 'res/move/left_down', 'res/move/right_up', 'res/move/right_down',
        'res/rest/sit_back'
    ];
    let removed = 0;
    for (const d of dirs) {
        const abs = path.join(WORKSPACE, d);
        if (!fs.existsSync(abs)) continue;
        for (const f of fs.readdirSync(abs)) {
            if (/^[1-5]_.*\.png$/.test(f)) {
                fs.unlinkSync(path.join(abs, f));
                removed++;
            }
        }
    }
    console.log(`已清理 ${removed} 张旧过渡帧\n`);
}

async function main() {
    console.log('=== 二分递归法生成动作过渡帧 ===');
    console.log('策略：帧3=blend(init,tgt), 帧2=blend(init,f3), 帧4=blend(f3,tgt), 帧1=blend(init,f2), 帧5=blend(f4,tgt)');
    console.log('插值：预乘alpha空间线性混合，避免半透明鬼影\n');

    await cleanupOldFrames();

    console.log('加载 init.png...');
    const initRaw = await loadRaw(initPath);
    console.log(`  尺寸: ${initRaw.info.width}x${initRaw.info.height}, 通道: ${initRaw.info.channels}\n`);

    console.log('生成各方向过渡帧...\n');
    let total = 0;
    for (const t of transitions) {
        const full = path.join(WORKSPACE, t.target);
        if (!fs.existsSync(full)) {
            console.log(`  [跳过] ${t.name}: 目标文件不存在`);
            continue;
        }
        const targetRaw = await loadRaw(full);

        // 确保尺寸一致
        if (targetRaw.info.width !== initRaw.info.width || targetRaw.info.height !== initRaw.info.height) {
            console.log(`  [跳过] ${t.name}: 尺寸不匹配 (${targetRaw.info.width}x${targetRaw.info.height} vs ${initRaw.info.width}x${initRaw.info.height})`);
            continue;
        }

        await generateFrames(initRaw, targetRaw, t.name, t.outDir);
        total += 5;
    }

    console.log(`\n=== 完成！共生成 ${total} 张过渡帧 ===`);
}

main().catch(err => { console.error('生成失败:', err); process.exit(1); });
