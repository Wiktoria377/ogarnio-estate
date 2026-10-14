import sharp from "sharp";
const [out, hue] = process.argv.slice(2);
const w = 2000, h = 1400;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,78%)"/><stop offset="1" stop-color="hsl(${hue},30%,92%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/><rect y="${h*0.62}" width="${w}" height="${h*0.38}" fill="hsl(${hue},12%,55%)"/><rect x="300" y="300" width="900" height="650" fill="hsl(${+hue+30},20%,96%)"/><polygon points="250,320 750,80 1250,320" fill="hsl(${+hue+180},25%,35%)"/><rect x="400" y="450" width="200" height="200" fill="hsl(200,40%,60%)"/><rect x="850" y="450" width="200" height="200" fill="hsl(200,40%,60%)"/><rect x="640" y="650" width="160" height="300" fill="hsl(25,40%,35%)"/><circle cx="1650" cy="700" r="260" fill="hsl(120,30%,40%)"/></svg>`;
await sharp(Buffer.from(svg)).jpeg().toFile(out);
