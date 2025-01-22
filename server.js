import express from 'express'; 
import fs from 'fs'; 
import cors from 'cors'; 
import lighthouse from 'lighthouse'; 
import * as chromeLauncher from 'chrome-launcher'; 
import path from 'path'; 
import { fileURLToPath } from 'url'; 

const app = express(); 
app.use(cors()); 
app.use(express.json()); 

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] }); 
const options = { logLevel: 'info', onlyCategories: ['accessibility'], port: chrome.port }; 

const __filename = fileURLToPath(import.meta.url); 
const __dirname = path.dirname(__filename); 
const reportsDir = path.join(__dirname, 'reports'); 

if (!fs.existsSync(reportsDir)) { 
    fs.mkdirSync(reportsDir); 
} 

function categorizeIssues(issues) { 
    const defectDetails = {}; 
    issues.forEach(issue => { 
        const category = categorizeIssue(issue); 
        if (category) { 
            if (!defectDetails[category]) { 
                defectDetails[category] = { count: 0, defects: [] }; 
            } 
            defectDetails[category].count += 1; 
            defectDetails[category].defects.push(issue); 
        } 
    }); 
    return Object.keys(defectDetails).map(type => ({ 
        type, 
        count: defectDetails[type].count, 
        defects: defectDetails[type].defects 
    })); 
} 

function categorizeIssue(issue) { 
    if (issue.title.includes('aria')) { 
        return 'ARIA'; 
    } else if (issue.title.includes('best practice')) { 
        return 'Best Practices'; 
    } 
    return 'Other'; 
} 

async function runLighthouse(url) { 
    const runnerResult = await lighthouse(url, { ...options, output: ['html', 'json'] }); 
    const reportHtml = runnerResult.report[0]; 
    const reportJson = JSON.parse(runnerResult.report[1]); 

    const accessibilityScore = reportJson.categories.accessibility.score; 
    const issues = Object.values(reportJson.audits) 
        .filter(audit => audit.score !== 1) 
        .map(audit => ({ 
            id: audit.id, 
            title: audit.title, 
            description: audit.description, 
            score: audit.score 
        })); 
    const categorizedIssues = categorizeIssues(issues); 
    const passedAudits = Object.values(reportJson.audits).filter(audit => audit.score === 1).length; 
    const manualChecks = Object.values(reportJson.audits).filter(audit => audit.scoreDisplayMode === 'manual').length; 
    const notApplicable = Object.values(reportJson.audits).filter(audit => audit.scoreDisplayMode === 'notApplicable').length; 

    return { reportHtml, accessibilityScore, issues: categorizedIssues, passedAudits, manualChecks, notApplicable }; 
} 

app.use('/reports', express.static(reportsDir)); 

app.post('/accessibility', async (req, res) => { 
    let urls = Array.isArray(req.body.url) ? req.body.url : [req.body.url]; 
    urls = [...new Set(urls)]; 
    const generatedReports = []; 

    for (const url of urls) { 
        try { 
            const { reportHtml, accessibilityScore, issues, passedAudits, manualChecks, notApplicable } = await runLighthouse(url); 
            if (!fs.existsSync(reportsDir)) { 
                fs.mkdirSync(reportsDir); 
            } 
            const fileName = `${url.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`; 
            const filePath = path.join(reportsDir, fileName); 

            fs.writeFileSync(filePath, reportHtml); 
            generatedReports.push({ 
                url, 
                report: `/reports/${fileName}`, 
                accessibilityScore, 
                issues, 
                passedAudits, 
                manualChecks, 
                notApplicable 
            }); 
        } catch (err) { 
            console.error('Error running Lighthouse:', err); 
            res.status(500).json({ message: 'Error running Lighthouse', url }); 
            return; 
        } 
    } 

    res.json({ message: 'Reports generated successfully', reports: generatedReports }); 
}); 

app.listen(3000, () => { 
    console.log('Server listening on port 3000!'); 
}); 

// Ensure to handle process exit and cleanup 
process.on('exit', () => { 
    chrome.kill(); 
}); 
