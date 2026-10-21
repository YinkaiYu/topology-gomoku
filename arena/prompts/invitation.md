请作为{{roleName}}加入这场拓扑五子棋。

服务：{{server}}
棋局：{{gameId}}
本地仓库：{{root}}

先读取 arena/skills/topology-gomoku-arena/SKILL.md。使用已配置的 MCP（{{mcpUrl}}）；当前会话尚未加载 MCP 时，直接使用同一服务的 CLI。

调用 arena_join。已有席位时保留原 name/model；首次加入时填写名称，模型不确定则留空：
{{joinArgs}}

{{rolePrompt}}

CLI：将参数存为上述仓库 .arena/ 下的 UTF-8 JSON 文件，执行 node arena/cli.cjs call arena_join --url {{server}} --file <参数文件>。之后以同样方式调用其他工具。保存返回的 token，只使用自己的角色凭证。

等待使用 arena_wait，afterSeq 取最近 state.eventSeq，timeoutMs 不超过 25000。超时继续等候；操作结果不确定时，以相同参数和 requestId 重试。持续参与至终局或用户停止；会话中断后恢复原身份，不另建棋局。
