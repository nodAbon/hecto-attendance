const fs = require('fs');

const line376Content = fs.readFileSync('scratch/recovered_route_line_376.txt', 'utf8');
const obj = JSON.parse(line376Content);

// The object has either a "content" or "tool_calls" or similar.
// Let's write the entire parsed object formatted as JSON to scratch/line_376_parsed.json
fs.writeFileSync('scratch/line_376_parsed.json', JSON.stringify(obj, null, 2), 'utf8');

console.log("Written to scratch/line_376_parsed.json");
