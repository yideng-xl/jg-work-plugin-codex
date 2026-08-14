---
name: reimburse
description: 上海巨耕报销自动化。用户说"搞报销/报销/整理发票"时触发。扫描一个报销文件夹的电子发票，生成可编辑的摘要 Excel；用户改完后生成 A4 拼贴 PDF 和交通费明细 Excel。
---

# 报销自动化

## 何时用
用户说"搞报销""报销""整理发票""拼发票"时。先确认：**差旅还是通用**（用户常会直接带）。

## 总流程（所有场景强制）

1. 用户先把本次报销的发票 PDF/XML、行程单、水单、订阅回执和支付凭证等放进同一个报销文件夹。
2. 明确本次属于“差旅”还是“通用”：
   - 差旅：跨城出行，可能包含火车、飞机、住宿、出差期间打车和补贴。
   - 通用：AI 订阅、市内交通、办公费用等不需要填写差旅行程的报销。
3. 确认本次实际报销人。用户没有主动提供姓名时，必须先问“本次报销人是谁？”，拿到明确姓名后再继续。报销人不得固定成某个姓名，也不得从历史文件猜测。
4. 扫描文件夹并核对票据，只生成中间表 `05-需确认-报销摘要.xlsx`。
5. 等用户检查、修改并明确确认。未确认前禁止生成 OA 明细、交通费明细和 A4 发票 PDF。
6. 读回用户确认后的摘要，传入本次实际报销人，生成全部 `09-终稿-` 文件。
7. 最后核对金额、票种、报销人、文件数量和命名，再交付用户。

## 金额口径（所有票据、所有阶段强制）

`金额`、`报销金额`统一指用户实际支付的**价税合计（含税金额）**。专票的税额单独填写，但不得从摘要的金额或 OA 的报销金额中扣除。

- 摘要 Excel 的`金额` = 发票价税合计 = 用户实际支付金额。
- 摘要 Excel 的`专票税额` = 发票税额；普票填 0 或留空，按现有模板规则执行。
- OA 明细的`报销金额` = 摘要 Excel 的`金额`。
- OA 明细的`增值税专票税额` = 摘要 Excel 的`专票税额`。
- OA 明细的`费用金额` = `报销金额 - 增值税专票税额`，只有这个字段是不含税金额。
- 表头`报销总金额` = Σ 报销金额；`增值税专票税额合计` = Σ 专票税额；`费用合计` = 报销总金额 - 增值税专票税额合计。

例：住宿专票价税合计 500.00 元，税额 50.00 元。摘要写`金额 500.00`、`专票税额 50.00`；OA 写`报销金额 500.00`、`增值税专票税额 50.00`、`费用金额 450.00`。票据只解析出不含税金额或只解析出税额时，不能反推并直接写入摘要；标记待确认，让用户补价税合计。

## 环境
脚本在 skill 自带 venv 跑：`~/.claude/skills/reimburse/.venv/bin/python`。
首次用先 `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`。
下面命令均假定 `cd ~/.claude/skills/reimburse`。

## 目录约定与首选入口 `summarize_folder`（一簦的报销习惯）

一簦放票有固定目录约定，**优先走这条**：顶层=场景（`01-出差/`=差旅 / 其他目录如 `10-AI订阅/`=通用）→ 时间层（差旅可用报销日期，如 `2026-07-20`；月度订阅可用 `202607`）→ 本次报销文件夹。原始材料可直接放在本次目录中，也可再按费用分类分子文件夹（`差旅费-交通费/`、`差旅-住宿费/`…）。

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

用户确认摘要后：`write_travel_detail(r["taxi_detail"], ...)` 出打车明细表；差旅场景 `write_oa_travel_detail(trips, r["items"], ...)`、通用场景 `write_oa_general_detail(r["items"], ...)` 出 OA 费用明细；`build_a4` 用 `r["tickets"]`（排除 `is_prepaid`/`is_slip`/无 pdf 的）。住宿解析暂未做，`unparsed` 里的住宿票要口头提醒用户手补金额/税额。

无论票据是平铺还是按费用分类放在子文件夹，都必须执行下面的两段式确认流程。`summarize_folder` 只负责扫描和汇聚，不能跳过用户确认。

## 两段式流程（所有场景强制）

### 第一段：生成摘要 Excel

1. 让用户给报销文件夹路径，并确认是差旅还是通用。用户未提供报销人姓名时，主动询问“本次报销人是谁？”。姓名未确认前不生成中间表或终稿。

2. 扫描：
   ```bash
   .venv/bin/python -m src.scan "<文件夹>"
   ```
   拿到原始 ticket JSON（列表，每张票一个 dict：`seller/invoice_kind/copies/date/amount/tax/trips/is_prepaid/pdf_path/...`）。

3. 对每张票做判断（脚本做不了的，Claude 来定）：

   - **科目**：`match_category(ticket, load_mapping("mapping.yaml"))`。命中直接填；没命中你按经验推断，`category_uncertain=True`（标黄）。mapping.yaml 里标"待确认"的规则（如 阿里云、物业）视同未命中，一样标黄让用户定。

     **交通票的差旅/市内区分**：打车票（xml 或裸 PDF）靠 `ItemName` 含"客运服务"判定——xml 的 item_name 是"*交通运输服务*客运服务费"，裸 PDF 提取文本缺"交通"前缀是"*运输服务*客运服务费"，两者公共子串都是"客运服务"，不看销售方名称。铁路票按票种"铁路电子客票"判定。这两类在 mapping.yaml 里统一兜底命中 `差旅费-交通费`——这是默认值，不是最终答案。实际科目按用户说的场景定：差旅场景 → `差旅费-交通费`；通用/市内场景 → `市内交通费`。如果场景是“通用”，把 `match_category` 命中的 `差旅费-交通费` 改成 `市内交通费` 再填进 row，不要照抄兜底值。

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
     - 市内打车填写实际地点类型：`公司`、`酒店`、`火车站`、`机场`等。先用住宿水单、发票、行程前后关系确定本次公司和入住酒店的位置，再判断上下车 POI 靠近哪一处。
     - 打车 POI 允许有定位偏差。茶馆、路名、商户、其他酒店等 POI，只要位于公司附近，就填 `公司`；位于实际入住酒店附近，就填 `酒店`。POI 名称中出现“酒店”，不代表它就是本次入住酒店。
     - 依据优先级：住宿水单/住宿发票中的地址 → 同一行程的前后上下车点 → 其他票据和行程信息。依据足够时直接归类；仍无法判断时保留 POI 原文，设置 `loc_uncertain=True` 标黄让用户确认。

     技术字段仍按原解析结果映射：`ticket["trips"]` 每段使用 `"from"`/`"to"`，摘要 row 使用 `"from_"`/`"to"`。即 `row["from_"] = ticket["trips"][0]["from"]`、`row["to"] = ticket["trips"][0]["to"]`；完成映射后再按上面的规则归一化。

   - **高德合并发票的日期**：电子发票 XML 里的 `RequestTime` 是开票/取票请求时间。`scan_folder` 优先用 `parse_itinerary_pdf` 按行程单的视觉列解析每段乘车日期、时间和起止地，地址跨行时按列归并；坐标法失败才降级到文本法。摘要的费用发生日期取实际乘车日期。行程单仍未解出日期时，才保留开票日并标黄让用户确认。

   - **住宿专票费用日期**：固定取发票开票日期，不取入住日、离店日或水单日期。这是摘要和 OA 费用发生日期的统一口径，不标黄。

   - **高铁/飞机方向与时刻**：高铁票优先用 `parse_train_pdf` 按票面坐标确认左侧出发站、右侧到达站，坐标法失败才保留文本候选值。再用票面日期 + 车次/航班号查询公开时刻表，复核方向并补计划到达时间；飞机按计划到达时间填写，不追踪实际延误。查询优先使用铁路、航空公司、机场等公开页面；找不到时再用可信的公开出行平台，并在交付说明中列为待用户核对。摘要和终稿只写确认后的方向、发车/起飞时间、到达时间，不写`按票面纠正解析方向`、`解析结果`、`估算`等过程说明。高铁备注只保留必要业务信息，例如`G0001，08:00 发车`。

4. 组装 row 列表（字段：`seq/filename/seller/invoice_kind/copies/date/amount/amount_usd/tax/category/category_uncertain/from_/to/loc_uncertain/reason/note/is_prepaid/is_allowance/allowance_days`）。其中 `amount` 必须是价税合计（含税金额），`tax` 是专票税额。禁止把 `amount - tax` 的结果写回 `amount`。

   **文件名列的写法是固定契约**：`row["filename"] = ticket["file_stem"]`——写 `scan_folder` 返回的 `file_stem`（不带后缀、已去掉"电子发票"等后缀的干净票号/文件名），**不要**写原始带扩展名的文件名。这是阶段二用"文件名"列反查、剔除预充值票的唯一 join key，两边字段不一致这个过滤就会静默失效。

   调用：
   ```python
   from src.summary_io import write_summary
   write_summary(rows, "<输出目录>/05-需确认-报销摘要.xlsx", rate=<已确认汇率>)
   ```

5. 告诉用户：摘要生成好了，标黄的是待你补（科目/起止地/补贴天数），标红的是不可报销（预充值）；高德票的日期是开票日不是乘车日，请核对；美元票金额列要在 Excel 里打开保存一次公式才会算出数。改完跟我说一声。

### 第二段：生成最终物

6. 用户说"好了"。读回改好的行：
   ```python
   from src.summary_io import read_summary
   rows = read_summary("<路径>/05-需确认-报销摘要.xlsx")
   ```

7. 生成产出物：

   预充值票是否可报销由 `scan_folder` 返回的原始 ticket `is_prepaid` 字段决定——这是权威、确定性的来源（由发票内容解析得出，不受用户改摘要影响）。`read_summary` 读回的摘要行**没有** `is_prepaid` 这个 key（`read_summary` 只返回 `seq/filename/seller/invoice_kind/copies/date/amount/tax/category/from_/to/reason/note`），所以过滤预充值票不能对摘要行调用 `r.get("is_prepaid")`（永远是 `None`，过滤形同虚设）。正确做法：先用 phase-1 保留下来的 `tickets` 列表（或重新 `scan_folder(folder)` 一次——它是确定性的，重跑结果不变）取出预充值票的文件名/`file_stem` 集合，再用摘要行的"文件名"列去匹配排除。

   - **A4 拼贴按票种拆分并按类型相邻排列**：直接从原始 `tickets`（自带 `is_prepaid`）过滤，跳过预充值票、住宿水单/行程单/订阅回执等非发票附件，也跳过没有 PDF 的票。先按普票/专票拆文件，再在各文件内按票据类型稳定分组：高铁票连续放在一起，飞机票连续放在一起，打车票连续放在一起，住宿票连续放在一起，其余票据放最后。同类型内部保持摘要顺序。普票和专票禁止混在同一个 PDF：
     ```python
     from src.build_a4 import build_a4
     valid = [t for t in tickets if not t["is_prepaid"] and t["pdf_path"]]
     type_order = {"高铁": 0, "飞机": 1, "打车": 2, "住宿": 3, "其他": 9}
     valid = sorted(valid, key=lambda t: type_order.get(t["a4_group"], 9))
     normal_specs = [
         {"path": t["pdf_path"], "copies": 1}
         for t in valid
         if t["invoice_kind"] in ("普票", "铁路电子客票")
     ]
     special_specs = [
         {"path": t["pdf_path"], "copies": 1}
         for t in valid
         if t["invoice_kind"] == "专票"
     ]
     if normal_specs:
         build_a4(normal_specs, "<输出目录>/09-终稿-A4发票-普票-打印1张.pdf")
     if special_specs:
         build_a4(special_specs, "<输出目录>/09-终稿-A4发票-专票-整份打印2次.pdf")
     ```
     `a4_group` 在组装票据时按内容确定：铁路电子客票=`高铁`，航空运输票据对应发票=`飞机`，客运服务打车票=`打车`，住宿服务发票=`住宿`，其余=`其他`。专票 PDF 内每张发票只放一次，不在文件中复制；打印时把整份专票 PDF 打印 2 次。`invoice_kind="unknown"` 时先读取 PDF 标题确认：标题含“增值税专用发票”归专票，含“普通发票”归普票；仍无法确认时让用户判断，不得混入任一打印文件。某类没有发票时不生成空 PDF。新文件检查通过后删除旧的混合 `A4拼贴.pdf`/`A4发票拼贴.pdf`，避免重复打印。任何因没有 PDF 被跳过的发票，要明确提醒用户。

   - **交通费明细（仅差旅场景生成）**：**只有开场用户说“差旅”时才出这份**。通用/市内场景（如打车抵票、月度市内交通）不生成交通费明细；确认摘要后只生成 OA 通用报销明细和 A4 发票 PDF。（制度里市内交通费虽提到明细表，但实操按用户口径：非差旅不附。拿不准就问用户一句。）
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
     write_travel_detail(
         transport_rows,
         "<输出目录>/09-终稿-交通费明细.xlsx",
         applicant="<本次实际报销人>",
     )
     ```
     这个 join 之所以能直接比对，是因为 phase-1 写摘要时"文件名"列写的就是 `ticket["file_stem"]`（见阶段一第 4 步的契约），跟这里 `prepaid_stems` 的 key 是同一种归一化形式，不需要再做 `Path(...).stem` 之类的二次处理。
     报销人必须使用本次实际报销人的姓名。`write_travel_detail` 强制要求传入 `applicant`；没有确认姓名时停止生成，不得沿用历史报销人的名字。

   - **OA 报销金额明细 Excel（照泛微 OA「技术报销」表单，方便照着填 OA、也给二期插件当数据源）**：`src/oa_forms.py`。通用场景出通用版、差旅场景出差旅版。

     **别弄混两类明细**：OA 的「报销费用明细」是**一个费用分类一行**（同类发票合计成一行，逐票明细在交通费明细表/A4 发票拼贴那边）；而交通费明细表（`write_travel_detail`）是**一票/一段行程一行**。两个 writer 分工不同。`write_oa_general_detail`/`write_oa_travel_detail` 默认 `aggregate=True`，内部按费用分类聚合，所以你把 `read_summary` 的逐票行原样传进去就行，不用自己先合并。

     表头信息区用 `default_header(kind, reason, applicant, fill_date, title, doc_no)` 生成（`kind` 传 `"通用"`/`"差旅"`；`applicant` 必须传本次实际报销人，不能使用固定姓名；其余未知项留空，写表时标黄让用户补）。表头的 **报销总金额/增值税专票税额合计/费用合计三个合计写表时自动按明细算**（`_inject_totals`），不用手填。这里的 `items[].amount` 仍是价税合计：OA 报销金额直接取 `amount`，费用金额才自动计算为 `amount - tax`。合计行是 SUM 公式。

     **订阅类报销事由必须写金额构成**：逐项写“订阅名称 + 费用月份 + 原币金额”，保留实际订阅币种；美元写“美元”，人民币写“元”，不要把原币金额全部改写成人民币。美元费用同时写确认汇率和折算金额；支付平台已有人民币实付时一并写出。末尾写人民币报销合计。例如：`订阅费用：服务 A 10 美元（按 7.00 折算 70.00 元）；服务 B 20.00 元；合计 90.00 元。`

     **订阅类费用发生日期取实际 AI 订阅时间**：填主要 AI 订阅的实际扣费/生效日期，不填用于抵票的云资源或物业发票日期。同批包含云资源费用时，也不改用云资源的订阅时间；各项费用月份和金额在报销事由中列明。

     **费用分类规范名（照真实报销单）**：交通 `差旅费-交通费`、住宿 `差旅-住宿费`、补贴 `补贴`（差旅内；非差旅市内交通是 `市内交通费`）。
     ```python
     from src.oa_forms import (write_oa_general_detail, write_oa_travel_detail,
                               infer_trip_defaults, default_header)
     # 通用（如抵票/市内交通）
     items = [{"category": r["category"], "date": r["date"], "amount": r["amount"],
               "tax": r["tax"], "note": r["note"]} for r in rows]  # rows 来自 read_summary，已剔预充值
     hdr = default_header(
         "通用",
         reason="<报销事由>",
         applicant="<本次实际报销人>",
         fill_date="<填报日>",
     )
     write_oa_general_detail(items, "<输出目录>/09-终稿-OA报销金额明细.xlsx", header_fields=hdr)

     # 差旅：先把交通行拼成 trips。高铁/飞机到达时间必须先查公开时刻表；
     # infer_trip_defaults 只补到达日期和住宿天数，不得用默认时长替代公开到达时间；
     # items 的 legs 是行程序号组合字符串（"12"=覆盖行程 1、2；补贴一般填全程）。
     trips = infer_trip_defaults([{"dep_date": .., "dep_time": .., "from_": .., "to": ..}, ...])
     write_oa_travel_detail(trips, items, "<输出目录>/09-终稿-OA差旅报销明细.xlsx",
                            header_fields=default_header(
                                "差旅",
                                reason="..",
                                applicant="<本次实际报销人>",
                            ))
     ```
     **legs（行程列）和标黄的推断值要你/用户核**：`legs` 该覆盖哪几段行程是判断题，脚本不自动填对，Codex 按票的实际发生行程定。高铁/飞机到达时间查公开时刻表后填写，不再使用默认在途时长；住宿天数仍可按往返日期推断并标黄。住宿发票明细格式还没做（慢慢完善），遇到先口头告知用户单独处理。

8. **回写映射**：用户这次改过的"卖方→科目"，用 `append_rule("mapping.yaml", 卖方关键词, 科目)` 追加/更新（按关键词 upsert，覆盖 mapping.yaml 里原来的"待确认"占位规则），下次同类票自动命中不再标黄。

## 规则速查
- 文件命名：需要用户确认的摘要固定为 `05-需确认-报销摘要.xlsx`；用户确认后生成的 Excel、PDF 等均加 `09-终稿-` 前缀。
- 份数与文件：普票/铁路电子客票进入 `09-终稿-A4发票-普票-打印1张.pdf`；专票进入 `09-终稿-A4发票-专票-整份打印2次.pdf`。两个 PDF 内每张发票都只放 1 次；专票由用户打印整份文件 2 次。某类为空则不生成。
- 金额：摘要金额、OA 报销金额都取价税合计（含税金额）；专票税额单列；只有 OA 费用金额按“报销金额−税额”计算。最终交付前必须验证：`报销总金额 = 费用合计 + 增值税专票税额合计`。
- 补贴：50 元/天，同日往返固化 1 天，按发车时间 12 点分界规则；`depart_time` 直接从 `scan_folder` 的 ticket dict 上读，不用另外解析 PDF。
- 预充值发票不可报销（标红、不计入合计、不进 A4）。`is_prepaid` 只存在于 `scan_folder` 的原始 ticket 里，`read_summary` 读回的摘要行没有这个字段——阶段二做任何"排除预充值"的过滤，都要靠 phase-1 保留的 `tickets`（或重跑一次 `scan_folder`）按文件名匹配，不能对摘要行 `r.get("is_prepaid")`。
- 高德发票日期字段是开票请求时间，不是实际用车日期，需用户核对。
- 住宿专票费用日期固定取开票日期，不取入住日或离店日。
- 起止地：跨城交通填城市；市内打车根据住宿地址、行程前后关系和其他票据，将 POI 归类为公司、酒店、火车站、机场等实际地点类型。茶馆、路名、商户或其他酒店可以代表附近的公司或入住酒店。
- 高铁/飞机按票面日期和车次/航班号查询公开计划时刻，校正方向并填写计划到达时间；终稿不保留解析、纠正或估算过程说明。
- A4 拼贴先分普票/专票，再按高铁、飞机、打车、住宿、其他分组排列；同类型票据连续放置。
- 美元票金额是公式，用户须在 Excel 里打开保存过一次，`read_summary` 才能读到算好的数。
- 订阅类 OA 报销事由逐项写原始币种金额；美元附汇率、折算金额或人民币实付，末尾写人民币报销合计。
- 订阅类费用发生日期取主要 AI 订阅的实际扣费/生效日期，不取抵票发票或同批云资源的日期。
- 交通费明细和 OA 表头必须写本次实际报销人。用户未提供姓名时必须主动询问；生成函数强制传入 `applicant`，姓名未确认时停止生成。过滤交通类行（含排除预充值票）是 Claude 的活，`write_travel_detail` 不过滤。交通费明细严格照 `90-invoice/模板/交通费报销明细表.xlsx`（宋体/边框/列宽/行高/SUM/报销人无边框），别改样式。
- OA 报销金额明细（`oa_forms.py`）：通用/差旅两版，费用金额=报销金额−专票税额（自动），合计 SUM 公式；表头信息区 `default_header` 生成、空值标黄；差旅行程缺列 `infer_trip_defaults` 推断标黄；行程列 legs 是判断题需 Claude/用户定；住宿明细未做。
- OFD 文件不解析（发票通常 xml/pdf/ofd 三件套，只用 xml+pdf）。
