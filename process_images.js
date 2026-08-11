const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const WORKSPACE = __dirname;

// 图片列表
const imageFiles = [
    { name: 'init', relPath: 'res/init/init.png' },
    { name: 'up', relPath: 'res/move/up/up.png' },
    { name: 'down', relPath: 'res/move/down/down.png' },
    { name: 'left', relPath: 'res/move/left/left.png' },
    { name: 'right', relPath: 'res/move/right/right.png' },
    { name: 'left_up', relPath: 'res/move/left_up/left_up.png' },
    { name: 'left_down', relPath: 'res/move/left_down/left_down.png' },
    { name: 'right_up', relPath: 'res/move/right_up/right_up.png' },
    { name: 'right_down', relPath: 'res/move/right_down/right_down.png' },
];

// 从边缘像素获取背景色
function getBackgroundColor(pixels, width, height, channels) {
    const samples = [
        [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
        [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
        [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)]
    ];
    let r = 0, g = 0, b = 0;
    let count = 0;
    for (const [x, y] of samples) {
        const idx = (y * width + x) * channels;
        r += pixels[idx];
        g += pixels[idx + 1];
        b += pixels[idx + 2];
        count++;
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

// 颜色距离
function colorDistance(c1, c2) {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// 去除背景
async function removeBackground(inputPath, tolerance = 40, feather = 15) {
    const { data, info } = await sharp(inputPath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    const pixels = new Uint8ClampedArray(data);
    const bgColor = getBackgroundColor(pixels, width, height, channels);
    
    // 设置alpha通道
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * channels;
            const color = [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
            const dist = colorDistance(color, bgColor);
            
            if (dist < tolerance) {
                pixels[idx + 3] = 0;
            } else if (dist < tolerance + feather) {
                const alpha = Math.round(((dist - tolerance) / feather) * 255);
                pixels[idx + 3] = Math.min(255, Math.max(0, alpha));
            }
        }
    }
    
    return sharp(pixels, {
        raw: { width, height, channels }
    });
}

// 自动裁剪透明边缘
async function autoCrop(imgPipeline, padding = 6) {
    const { data, info } = await imgPipeline
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    
    const { width, height, channels } = info;
    const pixels = new Uint8ClampedArray(data);
    
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasContent = false;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * channels;
            const alpha = channels >= 4 ? pixels[idx + 3] : 255;
            if (alpha > 20) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                hasContent = true;
            }
        }
    }
    
    if (!hasContent) return imgPipeline;
    
    const left = Math.max(0, minX - padding);
    const top = Math.max(0, minY - padding);
    const cropWidth = Math.min(width - left, maxX - minX + 1 + padding * 2);
    const cropHeight = Math.min(height - top, maxY - minY + 1 + padding * 2);
    
    return sharp(pixels, { raw: { width, height, channels } })
        .extract({ left, top, width: cropWidth, height: cropHeight });
}

// 放置到正方形画布并居中
async function fitToSquareCanvas(imgPipeline, targetSize, bgColor = { r: 0, g: 0, b: 0, alpha: 0 }) {
    const meta = await imgPipeline.metadata();
    const srcW = meta.width;
    const srcH = meta.height;
    
    const scale = Math.min(targetSize / srcW, targetSize / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const offsetX = Math.floor((targetSize - newW) / 2);
    const offsetY = Math.floor((targetSize - newH) / 2);
    
    return imgPipeline
        .resize(newW, newH, { kernel: sharp.kernel.lanczos3 })
        .extend({
            top: offsetY,
            bottom: targetSize - newH - offsetY,
            left: offsetX,
            right: targetSize - newW - offsetX,
            background: bgColor
        });
}

// 锐化
function sharpen(imgPipeline) {
    return imgPipeline.sharpen({ sigma: 0.8, m1: 0.5, m2: 0.5 });
}

async function main() {
    console.log('=== 猫咪图片批量处理 ===\n');
    
    // 第一步：处理所有图片并获取尺寸
    console.log('第一步：去背景并裁剪...');
    const processed = [];
    let maxDim = 0;
    
    for (const file of imageFiles) {
        const fullPath = path.join(WORKSPACE, file.relPath);
        if (!fs.existsSync(fullPath)) {
            console.log(`  跳过: ${file.relPath} 不存在`);
            continue;
        }
        
        console.log(`  处理: ${file.name}...`);
        
        let pipeline = await removeBackground(fullPath, 42, 18);
        pipeline = await autoCrop(pipeline, 6);
        
        // 获取尺寸信息
        const meta = await pipeline.metadata();
        maxDim = Math.max(maxDim, meta.width, meta.height);
        
        processed.push({ name: file.name, relPath: file.relPath, pipeline, meta });
        console.log(`    原始 -> 内容: ${meta.width}x${meta.height}`);
    }
    
    // 目标尺寸：浏览器插件标准128px
    const targetSize = 128;
    console.log(`\n统一目标尺寸: ${targetSize}x${targetSize}\n`);
    
    // 第二步：统一尺寸、锐化、保存
    console.log('第二步：统一尺寸、锐化、保存...');
    for (const item of processed) {
        const fullPath = path.join(WORKSPACE, item.relPath);
        
        let pipeline = item.pipeline;
        pipeline = await fitToSquareCanvas(pipeline, targetSize);
        pipeline = sharpen(pipeline);
        
        // 保存到临时文件再替换
        const tmpPath = fullPath + '.tmp.png';
        await pipeline.png().toFile(tmpPath);
        
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        fs.renameSync(tmpPath, fullPath);
        
        console.log(`  已保存: ${item.relPath} (${targetSize}x${targetSize})`);
    }
    
    // 第三步：生成插件图标
    console.log('\n第三步：生成插件图标（16/48/128）...');
    const iconDir = path.join(WORKSPACE, 'res', 'icons');
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });
    
    const initPath = path.join(WORKSPACE, 'res', 'init', 'init.png');
    if (fs.existsSync(initPath)) {
        for (const size of [16, 48, 128]) {
            let pipeline = sharp(initPath);
            pipeline = await fitToSquareCanvas(pipeline, size);
            const iconPath = path.join(iconDir, `icon${size}.png`);
            await pipeline.png().toFile(iconPath);
            console.log(`  生成: icon${size}.png (${size}x${size})`);
        }
    }
    
    console.log('\n=== 处理完成！ ===');
}

main().catch(err => {
    console.error('处理出错:', err);
    process.exit(1);
});
