# Panel

底部面板容器，当前包含 3 个视图：

- `Links`
- `Timeline`
- `Terminal`

## 结构

`Panel.tsx`

- 负责视图切换
- 负责拖拽调整尺寸
- 负责位置切换和终端头部右键菜单

`LinksPanel/`

- 展示双向链接、引用和未链接提及

`TimelinePanel/`

- 展示时间线记录

`TerminalPanel/`

- 展示终端实例和相关操作
