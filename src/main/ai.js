const OpenAI = require('openai');

async function analyzeFiles(items, settings, history = []) {
  const { apiKey, baseUrl, model, provider, debugMode } = settings;

  if (!apiKey) throw new Error("API Key is missing in settings.");

  // Configure Client
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  // If there's nothing at all, return empty plan
  if (!items || items.length === 0) {
    return {};
  }

  // Limit items for API
  const itemsToAnalyze = items.slice(0, 200);

  const systemPrompt = "You are a helpful assistant that outputs raw JSON.";

  let userPrompt = `You are an intelligent file and folder organizer. Your task is to analyze and categorize the following items.

ITEMS IN FOLDER:
${JSON.stringify(itemsToAnalyze, null, 2)}

Item format explained:
- Files: {"name": "filename.ext", "type": "file"}
- Folders: {"name": "foldername", "type": "folder", "context": {...}}
  - context.fileCount: number of files in the folder
  - context.topExtensions: most common file extensions inside
  - context.markers: project markers like package.json (Node.js), Cargo.toml (Rust), .git, etc.

YOUR TASK:
1. **Identify existing category folders**: Look for folders that appear to be organization categories (e.g., "Images", "Documents", "Downloads", "Projects", "Archives"). These typically:
   - Have descriptive names suggesting a category
   - Contain files (fileCount > 0)
   - Don't have project markers

2. **Identify items that need organizing**: These are:
   - Loose files in the root
   - Folders that are projects (have markers like package.json, .git, Cargo.toml)
   - Folders that seem randomly named or unorganized

3. **Create an organization plan**:
   - Use EXISTING category folder names when appropriate (e.g., if "Images" exists, use "Images" not "Pictures")
   - Group project folders under "Projects" or by type ("Node.js Projects", "Python Projects")
   - Only create NEW categories if no existing folder fits
   - Put truly miscellaneous items in "Misc"

4. **IMPORTANT - What NOT to organize**:
   - Do NOT include existing category folders as items to move (don't move "Images" folder into another folder)
   - If a folder is already serving as an organization category, leave it alone
   - If the folder is already well-organized (only has category folders, no loose files), return an empty plan {}

RESPONSE FORMAT - Return ONLY valid JSON (no markdown, no \`\`\`):
{
  "Category Name": {
    "reason": "Short explanation",
    "items": [{"name": "item1.txt", "type": "file"}, {"name": "MyProject", "type": "folder"}]
  }
}

If everything is already organized, return: {}`;

  if (history && history.length > 0) {
    userPrompt += `

Previous organization history (user preferences):
${JSON.stringify(history.slice(0, 20))}`;
  }

  try {
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o',
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
    });

    let content = response.choices[0].message.content.trim();
    const rawResponse = content;

    // Clean up markdown if present
    if (content.startsWith('```json')) content = content.replace(/^```json/, '').replace(/```$/, '');
    if (content.startsWith('```')) content = content.replace(/^```/, '').replace(/```$/, '');

    const result = JSON.parse(content);

    // If debug mode, return with debug info
    if (debugMode) {
      return {
        plan: result,
        debug: {
          systemPrompt,
          userPrompt,
          rawResponse,
          model: model || 'gpt-4o',
          usage: response.usage || null,
          itemCount: itemsToAnalyze.length
        }
      };
    }

    return result;
  } catch (error) {
    throw error;
  }
}

module.exports = { analyzeFiles };
