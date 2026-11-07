// Render measured evidence only. Does not make network/model requests.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = resolve(process.env.TOKENLOOM_REPORT_DIR || join(root, 'reports/2026-11-01'));
const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8').replace(/^\uFEFF/, ''));
const machine = read('machine-results.json');
const install = read('install-results.json');
const live = existsSync(join(dir, 'live-results.json')) ? read('live-results.json') : [];
const smoke = existsSync(join(dir, 'skill-smoke.json')) ? read('skill-smoke.json') : null;
const review = existsSync(join(dir, 'quality-review.json')) ? read('quality-review.json') : null;
const pct = (a,b) => a ? ((a-b)/a*100).toFixed(2) + '%' : '—';
const total = row => row.usage ? row.usage.input_tokens + row.usage.output_tokens : null;
const esc = text => String(text).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const md = [], html = [];
function heading(text, level=2) { md.push('#'.repeat(level)+' '+text); html.push(`<h${level}>${esc(text)}</h${level}>`); }
function para(text) { md.push(text); html.push('<p>'+esc(text)+'</p>'); }
function table(headers,rows) {
  md.push('| '+headers.join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(v=>String(v).replace(/\|/g,'\\|').replace(/\n/g,' ')).join(' | ')+' |').join('\n'));
  html.push('<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
}
heading('TokenLoom 0.1.0 · 本机安装与 token 实测报告',1);
para('测试日期：2026-11-01（Asia/Shanghai）。范围：本次编写的 TokenLoom；没有安装或对比 Caveman、RTK、TOON、LLMLingua。本报告保留零收益、负收益与失败情况。');
heading('结论与使用边界');
para('本地功能可运行：30 项自动测试、30 个本机数据案例、500 组固定种子的随机表格往返校验，以及 CLI 标准输入到解码的集成检查通过。技能文件已安装；重复安装拒绝覆盖，原文件校验和不变。');
const real = machine.rows.filter(r=>r.id.startsWith('real-'));
const realIn = real.reduce((a,r)=>a+r.inputTokens,0), realOut = real.reduce((a,r)=>a+r.outputTokens,0);
para(`压缩效果依赖输入结构。5 份真实项目文件合计 ${realIn} → ${realOut} 个本地 tokens，减少 ${pct(realIn,realOut)}；其中两份 JSON 配置受益，源码、说明正文和实际测试日志原样保留。合成的长重复日志可达 99.68%，但不能据此推断日常任务也有相同收益。`);
para('安装 Skill 主要影响回答方式和上下文选择，不会自动拦截全部请求或运行压缩 CLI。表格与日志的确定性压缩需要显式运行 CLI，再把结果交给模型。以下模型表格/日志实验包含了这一步，因此不是“只安装 Skill 后自动节省”的证明。');
heading('安装与环境');
table(['检查','结果'],[
 ['系统',`${machine.platform} ${machine.osRelease}`],['CPU / 内存',`${machine.cpu} / ${machine.ramGiB} GiB`],['Node',machine.node],['Codex CLI','0.164.0-alpha.11.1；现有 ChatGPT 登录'],['本地计数',`${machine.tokenizer} / ${machine.encoding}`],['技能目录',install.destination],['文件一致',String(install.sourceMatches)],['重复安装保护',`退出码 ${install.duplicateInstallExitCode}；原文件不变 ${install.existingUnchanged}`],['SKILL.md SHA-256',install.skillSha256],['真实技能调用',smoke?.usage ? '新 CLI 会话 $tokenloom 返回回答并声明使用该技能；未出现额外读文件工具事件' : '没有完整成功记录'],['ChatGPT 网页/桌面','网页连接两次超时；没有完成安装或界面模型实测。桌面端未自动化操作。']
]);
para('Codex 冒烟测试的回答声明使用 tokenloom，证明本次显式调用得到响应；不等于逐条规则执行的形式化证明。没有修改全局模型、hooks 或 MCP 配置。');
heading('本地测量方法');
para('按完整输入和完整输出用 o200k_base 编码，输出计入表头、重复次数和省略标记。不把字符数或文件压缩率当作 token。净收益列额外计入中文策略正文 54 tokens，并对拼接后的全文重新编码；负数表示附加策略抵消了节省。CLI 默认不附加策略。');
para('每例先检查结果和不变量，再运行 5 次记录本机耗时中位数；耗时不包含 Node 启动、文件 I/O 或模型请求。随机测试使用种子 0x1729、500 组扁平标量表格；并非对任意 JSON 的证明。JSON/表格往返校验保持紧凑原始 JSON 的标量拼写、键和顺序，不恢复原缩进。');
heading('逐例本地结果');
table(['案例','输入','输出','片段减少','加策略后净省','中位 ms','有损'],machine.rows.map(r=>[r.id,r.inputTokens,r.outputTokens,r.savedPercent+'%',r.netWithPolicy,r.medianMs,r.lossy?'是':'否']));
para('nested-table-fallback 的收益来自 JSON 空白移除，不是嵌套表格编码。focus 的高压缩率来自省略段落，不能视作信息无损；保护数字、否定、代码的规则是启发式，仍可能丢失跨段关系。日志合并保留显式次数和顺序，但不是字节级回放格式，需保留原文。');
heading('真实 Codex 三组对照');
para('固定请求模型 gpt-6-astra、reasoning effort=low、只读隔离目录；忽略用户配置、禁用 host skill discovery 和应用/插件/hooks/浏览器/多代理等可选工具。所有组共用同一配置。该设置用于控制变量，不代表用户原先 ultra 设置或 ChatGPT 网页端。请求没有固定模型快照 ID，生成也没有固定随机种子。');
para('共设计 4 个任务 × 3 组 × 2 次重复，独立新会话；按任务轮换组顺序，最多同时运行 4 个请求。A=原资料；B=原资料+“请简洁回答。”；C=TokenLoom。表格/日志的 C 使用 CLI 预处理+54 token 中文策略；两项说明任务的 C 使用完整 239 token Skill 正文。C 并非所有场景都运行同一种处理。');
para('第一轮 12 次调用的等待上限为 150 秒，详细解释的 A/C 两次触及上限，usage 缺失。保留失败记录，未重新发起它们；第二轮剩余 12 次的上限改为 240 秒，模型和其他设置不变。仅完整三组配对进入对照汇总；排除缺失组可能产生偏差，因此总数不能称为完成所有任务的端到端成本。');
para('主指标为 Codex turn.completed 回报的 input_tokens + output_tokens；reasoning_output_tokens 单列，不重复相加。缓存输入是 input_tokens 的子项，不从总 token 中扣除。无账单明细，不计算费用或订阅额度。CLI 未提供每次失败连接的完整 usage，以下总量只覆盖成功回合所报告用量，不宣称包含未知重试消耗。');
para(`目前记录 ${live.length}/24 次对照调用；其中 ${live.filter(r=>r.usage).length} 次有 usage，${live.filter(r=>r.qualityChecks).length} 次通过预设关键词/数值检查。正则命中只是一项基本检查，不能当作通用正确率或质量等价证明。`);
const comparison = [];
for (const task of [...new Set(live.map(r=>r.task))]) {
 for (const repeat of [1,2]) {
  const group=live.filter(r=>r.task===task&&r.repeat===repeat);
  const a=group.find(r=>r.arm==='baseline'),b=group.find(r=>r.arm==='concise'),c=group.find(r=>r.arm==='tokenloom');
  if (!a?.usage||!b?.usage||!c?.usage) continue;
  comparison.push([task,repeat,total(a),total(b),total(c),pct(total(a),total(c)),pct(total(b),total(c))]);
 }
}
table(['任务','重复','A 输入+输出','B 输入+输出','C 输入+输出','C 对 A 减少','C 对 B 减少'],comparison);
if (comparison.length) {
 const sums=comparison.reduce((s,r)=>[s[0]+r[2],s[1]+r[3],s[2]+r[4]],[0,0,0]);
 para(`仅完整配对的 ${comparison.length} 组总和：A ${sums[0]}，B ${sums[1]}，C ${sums[2]}；C 对 A 减少 ${pct(sums[0],sums[2])}，对 B 减少 ${pct(sums[1],sums[2])}。这是选定小样本的描述性总量；任务权重、共享宿主开销与回答长度影响结果，不能外推日常节省比例。`);
}
table(['请求','本地提示','input','cached input','output','reasoning 子项','总秒','连接错误数','关键词检查'],live.map(r=>[r.id,r.promptLocalTokens,r.usage?.input_tokens??'缺失',r.usage?.cached_input_tokens??'—',r.usage?.output_tokens??'—',r.usage?.reasoning_output_tokens??'—',(r.elapsedMs/1000).toFixed(1),r.errors.length,r.qualityChecks?'通过':'未通过']));
para('网络观测：预检及已观察到的调用先发生 WebSocket 超时重试，随后回退 HTTP 成功。连接耗时不能用来评判 TokenLoom 的速度。缓存命中在不同请求之间不一致，不能从这些记录计算统一费用折扣；本实验没有冷缓存与热缓存隔离。');
heading('回答质量审查');
if (review) {
 para(review.method);
 table(['任务','人工核查结果','限制'],review.tasks.map(r=>[r.task,r.finding,r.limitation]));
} else para('人工逐条审查尚未记录；此版本只能引用关键词检查结果。');
para('本次不覆盖多轮追问、复杂编码、工具调用过程的压缩、长会话恢复、真实业务资料、盲审或竞品对照。每组仅两次重复，不能声称统计显著或证明回答质量等价。不应承诺降低隐藏推理、订阅费用或提升套餐额度。');
heading('复现实验');
const commands='pnpm install --frozen-lockfile\npnpm test\nnode scripts/machine-benchmark.mjs\nnode scripts/install-codex.mjs  # 已安装时拒绝覆盖\n# 以下命令使用当前 Codex 登录并消耗模型用量，非离线测试\nnode scripts/live-eval.mjs --pilot\nnode scripts/live-eval.mjs --smoke\nnode scripts/live-eval.mjs --run\nnode scripts/render-machine-report.mjs';
md.push('```sh\n'+commands+'\n```');html.push('<pre>'+esc(commands)+'</pre>');
para('离线扩展测试读取 raw/unit-tests.tap；文件不存在时自动运行 node --test 并保存真实 TAP 输出。模型测试使用生成的 live-cases.json 合成数据，不上传上述真实本地项目文件。可用 TOKENLOOM_REPORT_DIR 指定独立输出目录；已有同名模型记录时拒绝覆盖。TOKENLOOM_EVAL_MODEL / TOKENLOOM_CODEX_BIN / TOKENLOOM_EVAL_CWD 可设置模型、CLI 路径和工作目录，改变时须重新标注实验条件。报告渲染另需本次安装记录 install-results.json；其他机器应记录自己的安装结果，不能照搬本次证明。');
heading('证据文件与实现校验和');
para('machine-results.json 包含原始计数、变换、警告及性能数据；install-results.json 记录安装验证；live-results.json 和 raw/*.jsonl 保存用量和回答；inputs/ 保存实际提示、压缩前后数据；raw/unit-tests.tap 为真实测试日志。预检与安装冒烟结果单列，不混入三组对照汇总。');
table(['文件','SHA-256'],Object.entries(machine.sourceHashes));
heading('参考口径');
const links=[['Codex 非交互运行与 JSON usage','https://learn.chatgpt.com/docs/non-interactive-mode'],['Codex 配置参考','https://learn.chatgpt.com/docs/config-file/config-reference'],['Codex skills','https://learn.chatgpt.com/docs/build-skills']];
for(const [label,url] of links){md.push(`[${label}](${url})`);html.push(`<p><a href="${url}">${esc(label)}</a></p>`);}
heading('对照回答全文');
for(const r of live){md.push(`### ${r.id}\n\n${r.answer||'（无完整回答）'}`);html.push(`<details><summary>${esc(r.id)}</summary><pre>${esc(r.answer||'（无完整回答）')}</pre></details>`);}
writeFileSync(join(dir,'REPORT.zh-CN.md'),md.join('\n\n')+'\n');
writeFileSync(join(dir,'REPORT.zh-CN.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TokenLoom 本机测试报告</title><style>body{font:16px/1.75 system-ui,"Microsoft YaHei",sans-serif;background:#f3f5f8;color:#1b293a;margin:0}main{max-width:1120px;margin:28px auto;padding:36px;background:white;border-radius:16px;box-shadow:0 6px 24px #1422380a}h1{font-size:30px;line-height:1.3}h2{margin-top:38px;padding-top:16px;border-top:2px solid #e5ebf2;font-size:23px}p{max-width:100ch}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:9px 11px;border-bottom:1px solid #e4e9f0;text-align:left;vertical-align:top}th{background:#eaf1f9;white-space:nowrap}tr:nth-child(even){background:#f8fafc}td:first-child{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6fa;padding:18px;border-radius:9px;font-size:13px}summary{cursor:pointer;padding:12px;background:#eaf1f9;margin-top:10px;border-radius:6px}a{color:#1457ae}@media(max-width:700px){main{margin:0;padding:18px;border-radius:0}h1{font-size:25px}}@media print{main{margin:0;box-shadow:none;padding:0}details{display:none}table{font-size:10px}}</style><main>'+html.join('\n')+'</main></html>');
console.log(JSON.stringify({report:join(dir,'REPORT.zh-CN.html'),liveCalls:live.length,completePairs:comparison.length}));
