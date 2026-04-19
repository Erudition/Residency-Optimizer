import fs from 'fs';

let html = fs.readFileSync('index.html', 'utf8');

// Update the root style block with more variables
const styleUpdate = `
    :root {
      --bg: 253 253 248;
      --accent: 229 231 224;
      --text-primary: 35 37 29;
      --text-secondary: 77 79 70;
      --text-muted: 115 117 107;
      --border: 210 211 204;
      --input-bg: 255 255 255;
      --input-border: 210 211 204;
      --input-bg-hover: 243 244 246;
      --input-border-hover: 47 128 250;
      
      --red: 245 78 0;
      --blue: 47 128 250;
      --orange: 235 157 42;
      --green: 106 168 79;
      --purple: 182 42 217;
      --pink: 227 76 111;
    }

    body {
      background-color: #FDFDF8;
      background-image: url('https://res.cloudinary.com/dmukukwp6/image/upload/carpet_light_27d74f73b5.png');
      background-repeat: repeat;
    }
`;

html = html.replace(/<style>[\s\S]*?:root \{[\s\S]*?\}[\s\S]*?<\/style>/, `<style>${styleUpdate}\n\n    /* Custom scrollbar for large spreadsheet */\n    .spreadsheet-container::-webkit-scrollbar {\n      height: 12px;\n      width: 12px;\n    }\n\n    .spreadsheet-container::-webkit-scrollbar-track {\n      background: #f1f1f1;\n    }\n\n    .spreadsheet-container::-webkit-scrollbar-thumb {\n      background: #cbd5e1;\n      border-radius: 6px;\n    }\n\n    .spreadsheet-container::-webkit-scrollbar-thumb:hover {\n      background: #94a3b8;\n    }\n\n    .no-scrollbar::-webkit-scrollbar {\n      display: none;\n    }\n\n    .no-scrollbar {\n      -ms-overflow-style: none;\n      scrollbar-width: none;\n    }\n  </style>`);

// Also update tailwind config to use these variables for the main colors to support opacity
html = html.replace(/"red": "#F54E00"/, '"red": "rgb(var(--red) / <alpha-value>)"');
html = html.replace(/"blue": "#2F80FA"/, '"blue": "rgb(var(--blue) / <alpha-value>)"');
html = html.replace(/"orange": "#EB9D2A"/, '"orange": "rgb(var(--orange) / <alpha-value>)"');
html = html.replace(/"green": "#6AA84F"/, '"green": "rgb(var(--green) / <alpha-value>)"');
html = html.replace(/"purple": "#B62AD9"/, '"purple": "rgb(var(--purple) / <alpha-value>)"');
html = html.replace(/"pink": "#E34C6F"/, '"pink": "rgb(var(--pink) / <alpha-value>)"');

fs.writeFileSync('index.html', html);
