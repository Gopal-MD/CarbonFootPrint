import fetch from 'node-fetch';

const url = 'https://carbonfootprint-984604014815.asia-south1.run.app/';
fetch(url).then(r=>r.text()).then(html => {
  const match = html.match(/<script type="module" crossorigin src="(.*?)"><\/script>/);
  if (match) {
    console.log('Script URL:', match[1]);
    fetch(url + match[1].substring(1)).then(r=>r.text()).then(js => {
      if (js.includes('[Firebase] Missing required environment variables:')) {
        console.log('YES! The bundle still contains the missing variables error string!');
        // Let's print what variables it checks
        const idx = js.indexOf('[Firebase] Missing required environment variables:');
        console.log('Snippet:', js.substring(idx - 100, idx + 200));
      } else {
        console.log('NO missing variables error string found in bundle.');
      }
      
      // Let's also check if ANY other error throws
      if (js.includes('throw new Error')) {
        const matches = [...js.matchAll(/throw new Error\((.*?)\)/g)];
        console.log('Other thrown errors:', matches.map(m => m[1]).join('\n'));
      }
    });
  } else {
    console.log('No script found');
  }
});
