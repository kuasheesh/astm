// --- CONFIGURATION ---
const ACCEPTABLE_VARIATION = 2.5; // kg/m³
// *** PASTE YOUR GOOGLE SHEET PUBLISHED CSV URL HERE ***
const ASTM_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR8KDpPr0Sz61z3-qLYG2wjB86twniR6NFMm4J2Y_hN_purRZYnhJr4LYGhBAL1OmmKieET5yMNNvK2/pub?gid=0&single=true&output=csv'; 

let astmTableData = null; // Will hold { headers, rowKeys, matrix }

// --- CORE LOGIC FUNCTIONS ---

/**
 * Helper function to parse a standard CSV string into a structured object.
 */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const matrix = [];
    const rowKeys = []; 
    
    // Headers (Temperatures) - skips the first blank/header cell
    const headers = lines[0].split(',').map(h => parseFloat(h.trim())).slice(1); 

    // Process remaining lines for row keys (Observed Densities) and data
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim());
        if (parts.length > 1) {
            rowKeys.push(parseFloat(parts[0]));
            // Remaining parts are the matrix data (Density at 15°C)
            matrix.push(parts.slice(1).map(p => parseFloat(p)));
        }
    }
    
    return { headers, rowKeys, matrix };
}

/**
 * Finds Density at 15°C using nearest-neighbor lookup in the ASTM table.
 */
function getDensityAt15C(obsTemp, obsDensity, astmTable) {
    const { headers: temps, rowKeys: densities, matrix } = astmTable;
    
    // Helper to find the index of the nearest value in an array
    function findNearestIndex(target, array) {
        let nearestDiff = Infinity;
        let nearestIndex = -1;
        
        for (let i = 0; i < array.length; i++) {
            const diff = Math.abs(target - array[i]);
            if (diff < nearestDiff) {
                nearestDiff = diff;
                nearestIndex = i;
            }
        }
        return nearestIndex;
    }

    // 1. Find the nearest index for Temperature (Column Index)
    const tempIndex = findNearestIndex(obsTemp, temps);
    
    // 2. Find the nearest index for Observed Density (Row Index)
    const densityIndex = findNearestIndex(obsDensity, densities);

    if (tempIndex === -1 || densityIndex === -1) {
        console.error("Input values are outside the range of the ASTM table.");
        return null;
    }

    // 3. Retrieve the corresponding Density at 15°C
    const densityAt15C = matrix[densityIndex][tempIndex];
    
    if (isNaN(densityAt15C)) {
        console.error("Found a non-numeric value in the ASTM table.");
        return null;
    }

    return densityAt15C; 
}


// --- DATA LOADING & MAIN FUNCTION ---

/**
 * Step 1: Fetch the ASTM Table Data and parse the CSV.
 */
async function loadASTMTable() {
    try {
        console.log("Fetching and parsing ASTM Table data...");
        const response = await fetch(ASTM_DATA_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const csvText = await response.text(); 
        astmTableData = parseCSV(csvText);
        
        document.getElementById('results').innerHTML = `<p class="result-pass">✅ ASTM Table loaded successfully. Ready for calculation.</p>`;
        
    } catch (error) {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = `<p class="result-fail">🛑 Error loading ASTM data. Please check the published CSV link.</p>`;
        console.error("Could not load ASTM data:", error);
    }
}

/**
 * Step 3: Main Calculation Function.
 * Called when the user clicks the button.
 */
function calculateDensityVariation() {
    if (!astmTableData) {
        document.getElementById('results').innerHTML = `<p class="result-fail">Data not loaded yet. Please wait or check for errors.</p>`;
        return;
    }

    // A. Get Input Values
    const dTemp = parseFloat(document.getElementById('dispatchTemp').value);
    const dDensity = parseFloat(document.getElementById('dispatchDensity').value);
    const rTemp = parseFloat(document.getElementById('receivingTemp').value);
    const rDensity = parseFloat(document.getElementById('receivingDensity').value);
    const resultsDiv = document.getElementById('results');

    if (isNaN(dTemp) || isNaN(dDensity) || isNaN(rTemp) || isNaN(rDensity)) {
        resultsDiv.innerHTML = `<p class="result-fail">🛑 Please enter valid numerical values for all fields.</p>`;
        return;
    }

    // B. Calculate Density at 15°C for both locations
    const dDensity15C = getDensityAt15C(dTemp, dDensity, astmTableData);
    const rDensity15C = getDensityAt15C(rTemp, rDensity, astmTableData);

    if (dDensity15C === null || rDensity15C === null) {
        resultsDiv.innerHTML = `<p class="result-fail">🛑 Conversion failed. Check if input values are within the ASTM table range.</p>`;
        return;
    }

    // C. Calculate the Variation
    const densityDifference = Math.abs(dDensity15C - rDensity15C);
    const isAcceptable = densityDifference <= ACCEPTABLE_VARIATION;

    // D. Display Results
    let resultMessage = `
        <h3>Calculation Summary</h3>
        <ul>
            <li><strong>Dispatch Density at 15°C:</strong> ${dDensity15C.toFixed(3)} kg/m³</li>
            <li><strong>Receiving Density at 15°C:</strong> ${rDensity15C.toFixed(3)} kg/m³</li>
            <li><strong>Absolute Difference:</strong> ${densityDifference.toFixed(3)} kg/m³</li>
        </ul>
        <hr>
    `;

    if (isAcceptable) {
        resultMessage += `<h3 class="result-pass">✅ Result: ACCEPTABLE</h3>`;
        resultMessage += `<p class="result-pass">The variation is within the limit of $\pm ${ACCEPTABLE_VARIATION.toFixed(1)}$ kg/m³.</p>`;
    } else {
        resultMessage += `<h3 class="result-fail">❌ Result: UNACCEPTABLE</h3>`;
        resultMessage += `<p class="result-fail">The variation of ${densityDifference.toFixed(3)} kg/m³ exceeds the limit of $\pm ${ACCEPTABLE_VARIATION.toFixed(1)}$ kg/m³.</p>`;
    }

    resultsDiv.innerHTML = resultMessage;
}

// Start loading the ASTM table data immediately
loadASTMTable();
