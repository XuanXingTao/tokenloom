// Independent representation: JSON columns + rows. This is not the TOON format.
// Keep original scalar lexemes: JSON.parse/JSON.stringify would round large IDs.
export function minifyJson(text) {
  try { JSON.parse(text); } catch { return null; }
  let quoted = false, escaped = false, result = '';
  for (const char of text) {
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') { quoted = true; result += char; }
    else if (!/[ \t\r\n]/.test(char)) result += char;
  }
  return result;
}

// Split valid, minified JSON at delimiters outside strings and nested structures.
function split(text, delimiter = ',') {
  if (!text) return [];
  let start = 0, depth = 0, quoted = false, escaped = false;
  const result = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (depth === 0 && c === delimiter) { result.push(text.slice(start, i)); start = i + 1; }
  }
  result.push(text.slice(start));
  return result;
}

const arrayItems = text => text?.startsWith('[') && text.endsWith(']') ? split(text.slice(1, -1)) : null;
const objectPairs = text => text?.startsWith('{') && text.endsWith('}') ? split(text.slice(1, -1)).map(part => split(part, ':')) : null;
const scalar = text => text && text[0] !== '[' && text[0] !== '{';
const uniqueKeys = keys => new Set(keys.map(key => JSON.parse(key))).size === keys.length;

export function encodeTable(text) {
  const compact = minifyJson(text);
  if (compact === null) return null;
  const objects = arrayItems(compact);
  if (!objects || objects.length < 2) return null;
  let columns;
  const rows = [];
  for (const object of objects) {
    const pairs = objectPairs(object);
    if (!pairs?.length || pairs.some(pair => pair.length !== 2 || !scalar(pair[1]))) return null;
    const keys = pairs.map(pair => pair[0]);
    if (!uniqueKeys(keys)) return null;
    if (!columns) columns = keys;
    if (keys.length !== columns.length || keys.some((key, i) => key !== columns[i])) return null;
    rows.push('[' + pairs.map(pair => pair[1]).join(',') + ']');
  }
  return '{"format":"tokenloom.table.v1","columns":[' + columns.join(',') + '],"rows":[' + rows.join(',') + ']}';
}

export function decodeTable(text) {
  const compact = minifyJson(text);
  if (compact === null) throw new Error('Invalid JSON table.');
  const pairs = objectPairs(compact);
  if (!pairs || pairs.length !== 3 || !uniqueKeys(pairs.map(pair => pair[0]))) throw new Error('Expected a TokenLoom table envelope.');
  const fields = new Map(pairs.map(([key, value]) => [JSON.parse(key), value]));
  if (fields.get('format') !== '"tokenloom.table.v1"') throw new Error('Unknown table format.');
  const columns = arrayItems(fields.get('columns'));
  const rawRows = arrayItems(fields.get('rows'));
  if (!columns?.length || !rawRows || columns.some(key => typeof JSON.parse(key) !== 'string') || !uniqueKeys(columns)) throw new Error('Invalid table columns or rows.');
  const objects = rawRows.map(raw => {
    const values = arrayItems(raw);
    if (!values || values.length !== columns.length || values.some(value => !scalar(value))) throw new Error('Invalid row width or non-scalar cell.');
    return '{' + columns.map((key, i) => key + ':' + values[i]).join(',') + '}';
  });
  return '[' + objects.join(',') + ']';
}
