const fs = require('fs');
const pkgs = ['react','react-dom','vite','typescript','tailwindcss','leaflet','echarts','axios'];
pkgs.forEach(k => {
  try {
    const v = JSON.parse(fs.readFileSync(`node_modules/${k}/package.json`, 'utf8')).version;
    console.log(k + ': ' + v);
  } catch(e) {
    console.log(k + ': not installed');
  }
});
