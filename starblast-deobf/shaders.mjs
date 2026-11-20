// Extracts every GLSL string literal (contains gl_Position / gl_FragColor) with its owning class.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default?.default ?? _traverse.default ?? _traverse;
const [,, inp, outDir] = process.argv;
const code = readFileSync(inp, 'utf8');
const ast = parse(code, { errorRecovery: true });
mkdirSync(outDir, { recursive: true });
const lines = code.split('\n');
let n = 0;
const strOf = node => node.type === 'StringLiteral' ? node.value
  : node.type === 'TemplateLiteral' ? node.quasis.map(q => q.value.cooked).join('${}') 
  : node.type === 'BinaryExpression' && node.operator === '+' ? (strOf(node.left) ?? '') + (strOf(node.right) ?? '') : null;
traverse(ast, {
  'StringLiteral|TemplateLiteral|BinaryExpression'(p) {
    if (p.parentPath.isBinaryExpression({ operator: '+' })) return;
    const s = strOf(p.node);
    if (!s || !/gl_Position|gl_FragColor/.test(s)) return;
    const line = p.node.loc.start.line;
    let cls = '?';
    for (let i = line - 1; i >= 0; i--) { const m = lines[i].match(/^  (?:this\.)?([\w$]+) = function \(\) \{$/); if (m) { cls = m[1]; break; } }
    const kind = /gl_Position/.test(s) ? 'vert' : 'frag';
    const f = `${outDir}/${cls}.${line}.${kind}.glsl`;
    writeFileSync(f, `// from ${cls} (game.named.js:${line})\n` + s);
    n++; console.log(f.split('/').pop(), s.length);
    p.skip();
  }
});
console.log(n, 'shaders');
