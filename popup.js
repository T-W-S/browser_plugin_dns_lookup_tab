/*
    Author: Tom W. Sch
    Created: 20.02.24
*/

// Function to perform a DNS lookup for a given type and domain
async function dnsLookup(type, domain) {
    // Construct the URL for the DNS query
    const url = `https://cloudflare-dns.com/dns-query?name=${domain}&type=${type}`;
    try {
        // Make a fetch request to the DNS server
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/dns-json'
            }
        });
        // Parse the response as JSON
        const data = await response.json();
        // Return the answer if available, otherwise return an empty array
        return data.Answer ? data.Answer.map(record => ({type: record.type, data: record.data})) : [];
    } catch (error) {
        // Log an error message if the DNS lookup fails and return an empty array
        console.error("DNS lookup failed:", error);
        return [];
    }
}

// Function to resolve a domain record to its IP address
async function resolveToIP(record) {
    // Extract the domain from the record
    const domain = record.includes(' ') ? record.split(' ')[1] : record;
    // Perform a DNS lookup for the 'A' record type
    const ips = await dnsLookup('A', domain);
    // Return a newline-separated list of IP addresses, converted to <br> for HTML display
    return ips.map(ip => ip.data).join('<br>'); // Modified to use <br> instead of '\n'
}

// Function to format the label for a domain record
function formatRecordLabel(data, type) {
    // Determine the label based on the content of the record
    if (data.includes('v=spf1')) return 'SPF';
    if (data.includes('v=DKIM1;')) return 'DKIM';
    if (data.includes('v=DMARC1;')) return 'DMARC';
    // Return the actual type if none of the specific conditions are met
    return type;
}

// Function to check domain records for various types
async function checkDomainRecords(domain, selector, includeIPv6) {
    // Open a new tab
    const newTab = window.open();
    // Write HTML content to the new tab
    newTab.document.write(`
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DNS Lookup Results</title>
            <style>
                /* CSS styles for the results container */
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background-color: #1e1e1e; /* Dark background */
                    color: #ffffff; /* Light text color */
                    padding: 20px;
                }
                .results {
                    margin-top: 20px;
                }
                .result-item {
                    margin-bottom: 20px;
                    padding: 15px;
                    border-radius: 8px;
                    background-color: #2d2d2d; /* Darker background */
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* Subtle box shadow */
                }
                .result-item p {
                    margin: 0;
                    font-size: 16px;
                }
                .record-name {
                    color: #d3d3d3; /* Light gray for record name */
                }
                .result-data {
                    color: #90ee90; /* Light green for result data */
                    word-wrap: break-word; /* Wrap long words */
                }
            </style>
        </head>
        <body>
            <h1>DNS Lookup Results</h1>
            <div class="results" id="results"></div>
        </body>
        </html>
    `);
    
    // Get the results container in the new tab
    const resultsContainer = newTab.document.getElementById('results');

    // Define the record types to check
    let recordTypes = ['A', 'MX', 'NS', 'CNAME', 'TXT'];
    // Add AAAA record type if requested
    if (includeIPv6) {
        recordTypes.push('AAAA');
    }

    // Iterate over each record type and display results
    for (let type of recordTypes) {
        let results = await dnsLookup(type, domain);
        // For A records, group multiple results into one block
        if (type === 'A' && results.length > 0) {
            let ips = await resolveToIP(domain);
            displayResults([{type: 'A', data: ips}], type, domain, resultsContainer);
        } else {
            await displayResults(results, type, domain, resultsContainer);
        }
    }

    // Handle DMARC and DKIM records if applicable
    if (selector && selector !== 'default') {
        let dkimResults = await dnsLookup('TXT', `${selector}._domainkey.${domain}`);
        if (dkimResults.length > 0) {
            await displayResults(dkimResults, 'DKIM', domain, resultsContainer);
        } else {
            displayNoResults('DKIM', domain, resultsContainer, true, selector);
        }
    }

    // Perform DNS lookup for DMARC record
    let dmarcResults = await dnsLookup('TXT', `_dmarc.${domain}`);
    // Display DMARC results
    await displayResults(dmarcResults, 'DMARC', domain, resultsContainer);
}

// Function to display domain record results
async function displayResults(results, type, domain, resultsElement) {
    // Iterate over each result and create a div to display it
    for (const result of results) {
        const resultDiv = document.createElement('div');
        resultDiv.classList.add('result-item');
        
        // Determine the label for the record
        let label = formatRecordLabel(result.data, type);

        // Additional info for MX and NS records (resolve to IP)
        let additionalInfo = '';
        if (['MX', 'NS'].includes(type)) {
            additionalInfo = ` (${await resolveToIP(result.data)})`;
        }

        // Format the record for display
        let formattedRecord = `<p class="record-name"><strong>${label} record for ${domain}:</strong></p>
                              <p class="result-data">${result.data.replace(/\n/g, '<br>')}${additionalInfo}</p>`; // Ensure newlines in A records are displayed correctly

        // Set the HTML content of the result div
        resultDiv.innerHTML = formattedRecord;
        // Append the result div to the results element
        resultsElement.appendChild(resultDiv);
    }
}

// Function to display a message when no results are found
function displayNoResults(type, domain, resultsElement, isDkim = false, selector = '') {
    const noResultDiv = document.createElement('div');
    noResultDiv.classList.add('result-item');
    let message = isDkim ? `No DKIM record found for selector "${selector}"` : `No ${type} record found for ${domain}`;
    noResultDiv.innerHTML = `<p class="record-name"><strong>${type} record for ${domain}:</strong></p>
                              <p class="result-data" style="color: red;">${message}</p>`;
    resultsElement.appendChild(noResultDiv);
}

// Event listener for when DOM content is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Event listener for the lookup button
    document.getElementById('lookup').addEventListener('click', async function() {
        // Get domain, selector, and IPv6 inclusion preference
        const domain = document.getElementById('domain').value.trim();
        const selector = document.getElementById('selector').value.trim();
        const includeIPv6 = document.getElementById('toggleIPv6').checked;
        // Perform domain record check
        checkDomainRecords(domain, selector, includeIPv6);
    });
});
