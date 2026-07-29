---
name: reimburse
description: 上海巨耕报销自动化。用户说"搞报销/报销/整理发票"时触发。扫描一个报销文件夹的电子发票，生成可编辑的摘要 Excel；用户改完后生成 A4 拼贴 PDF 和交通费明细 Excel。
---

# 报销自动化

## 何时用
用户说"搞报销""报销""整理发票""拼发票"时。先问一句：**差旅还是其他**（用户常会直接带）。

## 环境
脚本在 skill 自带 venv 跑：`~/.claude/skills/reimburse/.venv/bin/python`。
首次用先 `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`。
下面命令均假定 `cd ~/.claude/skills/reimburse`。

## 目录约定与首选入口 `summarize_folder`（一簦的报销习惯）

一簦放票有固定目录约定，**优先走这条**：顶层=场景（`01-出差/`=差旅 / `其他`如 `10-claude订阅/`=通用）→ 时间层（文件夹名=报销日期，如 `2026-04-10`）→ 票堆文件夹，票堆里再按费用分类分子文件夹（`差旅费-交通费/`、`差旅-住宿费/`…）。

**子文件夹名就是费用分类**，比按内容猜准得多。用 `summarize_folder` 一步汇聚：
```python
from src.aggregate_folder import summarize_folder
r = summarize_folder("<报销文件夹>")   # 穿透任意 1~2 级嵌套
# r["by_category"]  已按费用分类聚合的行（一类一行，普票税额=0），供核对/填 OA 费用明细
# r["items"]        逐票、已打 category（子文件夹名）的可报销票，喂 write_oa_* 聚合
# r["taxi_detail"]  打车明细表的行（仅打车；金额已填，打车原因预填"无直达交通"；日期按行程单补，起止地按下文地点类型规则补）
# r["unparsed"]     没解析出金额的票（如住宿发票待解析）——口头提醒用户补
# r["tickets"]      原始扫描结果（含 pdf_path/copies），喂 build_a4
```
**两类明细别混**（一簦定）：交通费报销明细表（附件）**只放打车**，高铁/飞机不进（发票直接进 A4），**但按费用分类汇总时打车+高铁+飞机都算进「差旅费-交通费」大类**。`summarize_folder` 已按此拆分：`taxi_detail` 只含打车，`by_category` 的交通费大类含全部交通。**普票税额一律写 0**（专票才写真实税额）。

拿到 `r` 后：`write_travel_detail(r["taxi_detail"], ...)` 出打车明细表；差旅场景 `write_oa_travel_detail(trips, r["items"], ...)`、其他场景 `write_oa_general_detail(r["items"], ...)` 出 OA 费用明细；`build_a4` 用 `r["tickets"]`（排除 `is_prepaid`/`is_slip`/无 pdf 的）。住宿解析暂未做，`unparsed` 里的住宿票要口头提醒用户手补金额/税额。

平铺没分子文件夹、或非一簦标准目录的情况，才回退下面的逐票判断+摘要 Excel 流程。

## 两段式流程

### 第一段：生成摘要 Excel

1. 让用户给报销文件夹路径 + 差旅/其他。

2. 扫描：
   ```bash
   .venv/bin/python -m src.scan "<文件夹>"
   ```
   拿到原始 ticket JSON（列表，每张票一个 dict：`seller/invoice_kind/copies/date/amount/tax/trips/is_prepaid/pdf_path/...`）。

3. 对每张票做判断（脚本做不了的，Claude 来定）：

   - **科目**：`match_category(ticket, load_mapping("mapping.yaml"))`。命中直接填；没命中你按经验推断，`category_uncertain=True`（标黄）。mapping.yaml 里标"待确认"的规则（如 阿里云、物业）视同未命中，一样标黄让用户定。

     **交通票的差旅/市内区分**：打车票（xml 或裸 PDF）靠 `ItemName` 含"客运服务"判定——xml 的 item_name 是"*交通运输服务*客运服务费"，裸 PDF 提取文本缺"交通"前缀是"*运输服务*客运服务费"，两者公共子串都是"客运服务"，不看销售方名称。铁路票按票种"铁路电子客票"判定。这两类在 mapping.yaml 里统一兜底命中 `差旅费-交通费`——这是默认值，不是最终答案。实际科目按用户说的场景定：差旅场景 → `差旅费-交通费`；其他/市内场景（用户在开场说的是"其他"）→ `市内交通费`。如果场景是"其他"，把 `match_category` 命中的 `差旅费-交通费` 改成 `市内交通费` 再填进 row，不要照抄兜底值。

   - **预充值**：`ticket["is_prepaid"]` 为真，标红，金额不计入合计，备注写"预充值发票不可报销"。

   - **美元票**（如 claude/阿里云订阅，金额是美元）：`amount_usd` 填美元原值、`amount=None`，`write_summary` 会把金额列写成公式 `=<美元数>*$B$1` 引汇率格。汇率不要使用长期固定默认值，按以下优先级确定：
     1. 同笔信用卡或支付平台账单里的人民币实际扣款；
     2. 同期、同支付方式的其他票据，用“人民币实付 ÷ 美元金额”推算，保留两位小数；
     3. 以上都没有时，向用户确认汇率。
     调用 `write_summary` 时必须显式传入已确认的汇率。用户修改 B1 后，整表金额联动重算。
     **注意**：`read_summary` 用 `data_only=True` 打开，只能读到 Excel **缓存**的公式计算结果——如果用户编辑摘要时没有真正在 Excel 里打开+保存过这个文件，美元票那行的金额读回来会是 `None`（不是报错，但阶段二算合计/填交通费明细时要当 0 处理，且要提醒用户"金额列显示空白是因为还没在 Excel 里存过一次"）。**告诉用户：改完表之后务必在 Excel 里打开并保存一次**，让公式结果被缓存，再告诉 Claude"好了"。

   - **补贴**（差旅）：从两张往返火车票算出差天数，加一行 `is_allowance=True`、科目"差旅补贴"、金额写成公式字符串 `"=<天数>*50"`（openpyxl 对以 `=` 开头的字符串会自动存成公式，不需要额外处理）。
     天数用 `compute_allowance_days(dep_date, dep_time, ret_date, ret_time)`：同日往返固化算 1 天；否则按 12 点分界（出发日 12 点前 1 天/12 点后 0.5 天，返回日 12 点后 1 天/12 点前 0.5 天）+ 中间整天。
     `depart_time`（发车时间）直接从 `scan_folder` 返回的 ticket dict 上读，不用再解析一次 PDF：
     ```python
     dep = compute_allowance_days(
         out_ticket["date"], out_ticket["depart_time"],
         ret_ticket["date"], ret_ticket["depart_time"],
     )
     ```
     天数拿不准就把这行 `category_uncertain=True` 标黄，备注写清楚推算依据（哪天哪个时刻出发/返回），方便用户核对。

   - **起止地**：先按交通类型归一化，再填 `from_`/`to`。
     - 飞机、火车等跨城行程只写城市，如 `上海 → 太原`。摘要和 OA 行程明细都不写机场、航站楼、火车站名。
     - 市内打车只写地点类型组合，如 `酒店 → 办公室`、`办公室 → 火车站`、`办公室 → 机场`、`酒店 → 机场`。不要照抄地图里的门牌、商户名或 POI 全称。
     - 打车定位存在偏差。结合行程单的上下车点和其他票据判断附近地点；酒店优先用住宿水单上的酒店名称、地址辅助判断。上车点落在酒店附近的商户或道路时，填 `酒店`。
     - 能判断地点类型就直接填。判断不清时留空，设置 `loc_uncertain=True` 标黄让用户确认，不猜。

     技术字段仍按原解析结果映射：`ticket["trips"]` 每段使用 `"from"`/`"to"`，摘要 row 使用 `"from_"`/`"to"`。即 `row["from_"] = ticket["trips"][0]["from"]`、`row["to"] = ticket["trips"][0]["to"]`；完成映射后再按上面的规则归一化。

   - **高德合并发票的日期陷阱**：高德打车的电子发票（xml）里 `RequestTime`（`scan.py` 塞进 `date` 字段的那个值）是**开票/取票请求时间**，不是真实用车时间——例如 7 月才点的开票，但行程实际发生在 5 月。行程单（`itinerary_pdf`）里有每段行程的真实上车时间，但当前 `parse_itinerary_text` 只返回 `{from, to}`，**没有把日期解析出来**。所以：摘要里高德票那行"费用发生日期"来自 `RequestTime`，**很可能是开票日而不是实际消费日**。不要在摘要或跟用户的话术里说"这就是打车当天"——生成摘要时对高德票的日期加个提示（可以写进备注，或口头告知用户），让用户自己核对/改成真实用车日期，尤其是这张票要落到某个月的报销周期时。

4. 组装 row 列表（字段：`seq/filename/seller/invoice_kind/copies/date/amount/amount_usd/tax/category/category_uncertain/from_/to/loc_uncertain/reason/note/is_prepaid/is_allowance/allowance_days`）。

   **文件名列的写法是固定契约**：`row["filename"] = ticket["file_stem"]`——写 `scan_folder` 返回的 `file_stem`（不带后缀、已去掉"电子发票"等后缀的干净票号/文件名），**不要**写原始带扩展名的文件名。这是阶段二用"文件名"列反查、剔除预充值票的唯一 join key，两边字段不一致这个过滤就会静默失效。

   调用：
   ```python
   from src.summary_io import write_summary
   write_summary(rows, "<输出目录>/报销摘要.xlsx", rate=<已确认汇率>)
   ```

5. 告诉用户：摘要生成好了，标黄的是待你补（科目/起止地/补贴天数），标红的是不可报销（预充值）；高德票的日期是开票日不是乘车日，请核对；美元票金额列要在 Excel 里打开保存一次公式才会算出数。改完跟我说一声。

### 第二段：生成最终物

6. 用户说"好了"。读回改好的行：
   ```python
   from src.summary_io import read_summary
   rows = read_summary("<路径>/报销摘要.xlsx")
   ```

7. 生成产出物：

   预充值票是否可报销由 `scan_folder` 返回的原始 ticket `is_prepaid` 字段决定——这是权威、确定性的来源（由发票内容解析得出，不受用户改摘要影响）。`read_summary` 读回的摘要行**没有** `is_prepaid` 这个 key（`read_summary` 只返回 `seq/filename/seller/invoice_kind/copies/date/amount/tax/category/from_/to/reason/note`），所以过滤预充值票不能对摘要行调用 `r.get("is_prepaid")`（永远是 `None`，过滤形同虚设）。正确做法：先用 phase-1 保留下来的 `tickets` 列表（或重新 `scan_folder(folder)` 一次——它是确定性的，重跑结果不变）取出预充值票的文件名/`file_stem` 集合，再用摘要行的"文件名"列去匹配排除。

   - **A4 拼贴按票种拆分**：直接从原始 `tickets`（自带 `is_prepaid`）过滤，跳过预充值票、住宿水单/行程单/订阅回执等非发票附件，也跳过没有 PDF 的票。普票和专票禁止混在同一个 PDF：
     ```python
     from src.build_a4 import build_a4
     valid = [t for t in tickets if not t["is_prepaid"] and t["pdf_path"]]
     normal_specs = [
         {"path": t["pdf_path"], "copies": 1}
         for t in valid
         if t["invoice_kind"] in ("普票", "铁路电子客票")
     ]
     special_specs = [
         {"path": t["pdf_path"], "copies": 2}
         for t in valid
         if t["invoice_kind"] == "专票"
     ]
     if normal_specs:
         build_a4(normal_specs, "<输出目录>/A4发票-普票-打印1张.pdf")
     if special_specs:
         build_a4(special_specs, "<输出目录>/A4发票-专票-打印2张.pdf")
     ```
     `invoice_kind="unknown"` 时先读取 PDF 标题确认：标题含“增值税专用发票”归专票，含“普通发票”归普票；仍无法确认时让用户判断，不得混入任一打印文件。某类没有发票时不生成空 PDF。新文件检查通过后删除旧的混合 `A4拼贴.pdf`/`A4发票拼贴.pdf`，避免重复打印。任何因没有 PDF 被跳过的发票，要明确提醒用户。

   - **交通费明细（仅差旅场景生成）**：**只有开场用户说"差旅"时才出这份**。其他/市内场景（如打车抵票、月度市内交通）**不生成交通费明细**，只交摘要 + A4 拼贴即可，别多出一份。（制度里市内交通费虽提到明细表，但实操按用户口径：非差旅不附。拿不准就问用户一句。）
     生成时：`write_travel_detail(rows, out)` 是纯写入函数，**不做任何过滤**——传进去什么就原样写什么。过滤是 Claude 的活：从 `read_summary` 读回的行里，先挑出"科目含【交通费】"的行，排除"差旅补贴"这类非交通行，**再排除预充值票**——由于摘要行没有 `is_prepaid`，要用 phase-1 的 `tickets`（或重跑一次 `scan_folder(folder)`）算出预充值票的文件名集合，按"文件名"列匹配剔除：
     ```python
     from src.scan import scan_folder
     from src.summary_io import write_travel_detail

     tickets = scan_folder(folder)  # 确定性：is_prepaid 由发票内容解出，与用户怎么改摘要无关
     prepaid_stems = {t["file_stem"] for t in tickets if t["is_prepaid"]}

     transport_rows = [
         r for r in rows
         if r.get("category") and "交通费" in r["category"]
         and r.get("filename") not in prepaid_stems
     ]
     write_travel_detail(transport_rows, "<输出目录>/交通费明细.xlsx")
     ```
     这个 join 之所以能直接比对，是因为 phase-1 写摘要时"文件名"列写的就是 `ticket["file_stem"]`（见阶段一第 4 步的契约），跟这里 `prepaid_stems` 的 key 是同一种归一化形式，不需要再做 `Path(...).stem` 之类的二次处理。
     报销人固定写"许磊"（`write_travel_detail` 内部已经写死，不用传）。

   - **OA 报销金额明细 Excel（照泛微 OA「技术报销」表单，方便照着填 OA、也给二期插件当数据源）**：`src/oa_forms.py`。通用场景出通用版、差旅场景出差旅版。

     **别弄混两类明细**：OA 的「报销费用明细」是**一个费用分类一行**（同类发票合计成一行，逐票明细在交通费明细表/A4 发票拼贴那边）；而交通费明细表（`write_travel_detail`）是**一票/一段行程一行**。两个 writer 分工不同。`write_oa_general_detail`/`write_oa_travel_detail` 默认 `aggregate=True`，内部按费用分类聚合，所以你把 `read_summary` 的逐票行原样传进去就行，不用自己先合并。

     表头信息区用 `default_header(kind, reason, fill_date, title, doc_no)` 生成（`kind` 传 `"通用"`/`"差旅"`；已知项填默认如 申请人=许磊/报销类型，其余留空写表时标黄让用户补）。表头的 **报销总金额/增值税专票税额合计/费用合计三个合计写表时自动按明细算**（`_inject_totals`），不用手填。费用金额列自动 = 报销金额 − 专票税额。合计行是 SUM 公式。

     **订阅类报销事由必须写金额构成**：逐项写“订阅名称 + 费用月份 + 原币金额”，保留实际订阅币种；美元写“美元”，人民币写“元”，不要把原币金额全部改写成人民币。美元费用同时写确认汇率和折算金额；支付平台已有人民币实付时一并写出。末尾写人民币报销合计。例如：`AI订阅费用：ChatGPT Pro 100美元（按7.09折算709.00元）；阿里云ECS 2026年6月8美元（实付56.63元）、7月8美元（实付56.76元）；合计822.39元。`

     **费用分类规范名（照真实报销单）**：交通 `差旅费-交通费`、住宿 `差旅-住宿费`、补贴 `补贴`（差旅内；非差旅市内交通是 `市内交通费`）。
     ```python
     from src.oa_forms import (write_oa_general_detail, write_oa_travel_detail,
                               infer_trip_defaults, default_header)
     # 通用（如抵票/市内交通）
     items = [{"category": r["category"], "date": r["date"], "amount": r["amount"],
               "tax": r["tax"], "note": r["note"]} for r in rows]  # rows 来自 read_summary，已剔预充值
     hdr = default_header("通用", reason="<报销事由>", fill_date="<填报日>")
     write_oa_general_detail(items, "<输出目录>/OA报销金额明细.xlsx", header_fields=hdr)

     # 差旅：先把交通行拼成 trips，infer_trip_defaults 补到达日期/到达时间/住宿天数
     # （到达时间按+2h、住宿天数按往返日期跨度推，都会标黄提醒核对）；
     # items 的 legs 是行程序号组合字符串（"12"=覆盖行程 1、2；补贴一般填全程）。
     trips = infer_trip_defaults([{"dep_date": .., "dep_time": .., "from_": .., "to": ..}, ...])
     write_oa_travel_detail(trips, items, "<输出目录>/OA差旅报销明细.xlsx",
                            header_fields=default_header("差旅", reason=".."))
     ```
     **legs（行程列）和标黄的推断值要你/用户核**：`legs` 该覆盖哪几段行程是判断题，脚本不自动填对，Claude 按票的实际发生行程定；到达时间/住宿天数是推断默认，标黄让用户改。住宿发票明细格式还没做（慢慢完善），遇到先口头告知用户单独处理。

8. **回写映射**：用户这次改过的"卖方→科目"，用 `append_rule("mapping.yaml", 卖方关键词, 科目)` 追加/更新（按关键词 upsert，覆盖 mapping.yaml 里原来的"待确认"占位规则），下次同类票自动命中不再标黄。

## 规则速查
- 份数与文件：普票/铁路电子客票进入 `A4发票-普票-打印1张.pdf`，每张 1 份；专票进入 `A4发票-专票-打印2张.pdf`，每张重复 2 份；某类为空则不生成。
- 补贴：50 元/天，同日往返固化 1 天，按发车时间 12 点分界规则；`depart_time` 直接从 `scan_folder` 的 ticket dict 上读，不用另外解析 PDF。
- 预充值发票不可报销（标红、不计入合计、不进 A4）。`is_prepaid` 只存在于 `scan_folder` 的原始 ticket 里，`read_summary` 读回的摘要行没有这个字段——阶段二做任何"排除预充值"的过滤，都要靠 phase-1 保留的 `tickets`（或重跑一次 `scan_folder`）按文件名匹配，不能对摘要行 `r.get("is_prepaid")`。
- 高德发票日期字段是开票请求时间，不是实际用车日期，需用户核对。
- 起止地：跨城交通填城市；市内打车填地点类型组合。酒店附近的定位结合住宿水单判断为"酒店"，不照抄具体 POI。
- 美元票金额是公式，用户须在 Excel 里打开保存过一次，`read_summary` 才能读到算好的数。
- 订阅类 OA 报销事由逐项写原始币种金额；美元附汇率、折算金额或人民币实付，末尾写人民币报销合计。
- 交通费明细报销人固定"许磊"；过滤交通类行（含排除预充值票）是 Claude 的活，`write_travel_detail` 不过滤。交通费明细严格照 `90-invoice/模板/交通费报销明细表.xlsx`（宋体/边框/列宽/行高/SUM/报销人无边框），别改样式。
- OA 报销金额明细（`oa_forms.py`）：通用/差旅两版，费用金额=报销金额−专票税额（自动），合计 SUM 公式；表头信息区 `default_header` 生成、空值标黄；差旅行程缺列 `infer_trip_defaults` 推断标黄；行程列 legs 是判断题需 Claude/用户定；住宿明细未做。
- OFD 文件不解析（发票通常 xml/pdf/ofd 三件套，只用 xml+pdf）。
