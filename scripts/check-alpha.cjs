const fs = require('fs');

function checkPngAlpha(filePath) {
    const buffer = fs.readFileSync(filePath);
    // PNG signature is 8 bytes. IHDR chunk starts at byte 8.
    // IHDR length (4 bytes), type 'IHDR' (4 bytes), Width (4), Height (4), Bit depth (1), Color type (1)
    // The Color type byte is at offset 8 + 4 + 4 + 4 + 4 + 1 - 1 = 24
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
        console.log(`${filePath} is not a valid PNG.`);
        return;
    }
    const colorType = buffer[25];
    const hasAlpha = colorType === 4 || colorType === 6;
    console.log(`${filePath}: Color Type = ${colorType}, Has Alpha Channel = ${hasAlpha}`);
}

checkPngAlpha('photos/dark_mode_logo.png');
checkPngAlpha('photos/white_mode_logo.png');
