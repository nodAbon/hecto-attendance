const fs = require('fs');

const data = fs.readFileSync('scratch/word_match_710.json', 'utf8');
const obj = JSON.parse(data);

// Let's print out what tools it called
if (obj.tool_calls) {
  obj.tool_calls.forEach((tc, idx) => {
    console.log(`Tool call ${idx}:`, Object.keys(tc));
    console.log(`Tool call name:`, tc.name);
    console.log(`Tool call arguments type:`, typeof tc.args);
    console.log(`Tool call arguments:`, JSON.stringify(tc.args).substring(0, 500));
    if (tc.args && tc.args.CodeContent) {
      console.log("Writing CodeContent to scratch/recovered_code_710.js");
      fs.writeFileSync('scratch/recovered_code_710.js', tc.args.CodeContent);
    }
  });
} else {
  console.log("No tool calls in this line. Content: ", obj.content ? obj.content.substring(0, 500) : "empty");
}
