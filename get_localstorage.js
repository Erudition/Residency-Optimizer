import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  
  // Wait for the app to load
  await new Promise(r => setTimeout(r, 2000));
  
  const data = await page.evaluate(() => {
    return {
      residents: localStorage.getItem('rsp_residents_v2'),
      schedules: localStorage.getItem('rsp_schedules_v1')
    };
  });
  
  import('fs').then(fs => {
    fs.writeFileSync('dump.json', JSON.stringify(data, null, 2));
  });
  
  await browser.close();
})();
