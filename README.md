# jg-work-plugin-codex

JG 工作类 Codex 插件。

当前包含 `reimburse` Skill，用于整理差旅、订阅和其他报销材料：

- 扫描并核对发票；
- 生成报销摘要和 OA 明细；
- 订阅类报销事由按原始币种列明金额构成；
- 按普票、专票拆分 A4 打印 PDF；
- 普票打印 1 张，专票打印 2 张；
- 美元费用优先按实际扣款或同期票据确定汇率。

## 安装

```bash
codex plugin marketplace add yideng-xl/jg-work-plugin-codex --ref main
```

重启 Codex 后，在 **Plugins** 中找到 **JG Work**，安装 `jg-work-plugin-codex`。

## 更新

```bash
codex plugin marketplace upgrade jg-work
```

更新后重启 Codex，并新建任务使用。
