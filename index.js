import fs from 'fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const chrome = await chromeLauncher.launch({chromeFlags: ['--headless']});
const options = {logLevel: 'info', output: 'html', onlyCategories: ['accessibility'], port: chrome.port};
const runnerResult = await lighthouse('https://www.bpsgentech.com/Account/Login', options);

// `.report` is the HTML report as a string
const reportHtml = runnerResult.report;
fs.writeFileSync('lhreport.html', reportHtml);

// `.lhr` is the Lighthouse Result as a JS object
console.log('Report is done for', runnerResult.lhr.finalDisplayedUrl);
// console.log('Performance score was', runnerResult);
console.log('Accessibility score was', runnerResult.lhr.categories.accessibility);

chrome.kill();