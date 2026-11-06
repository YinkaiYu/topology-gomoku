/**
 * Browser half of the arena's DeepSeek Harness integration.
 *
 * It contributes one panel: a sidebar entry plus a main-column view that frames
 * the arena's own `?embed=1` spectator page. Nothing about the board is
 * reimplemented here, so the DSH view and the browser view are the same page,
 * the same renderer and the same SSE stream.
 */
window.__ModuleLoader__.load({
  id: '@local/topology-gomoku-arena',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'topology-arena'
    /** Sidebar panel id; the main-panel key must match. */
    const PANEL_ID = 'topology-arena'
    /** Host route serving the panel read model. */
    const API = '/topology-arena/api/view'

    const TEXT = {
      zh: {
        panel: '对弈室',
        refresh: '刷新',
        open: '在浏览器打开',
        select: '选择棋局',
        offline: '对弈服务未运行',
        offlineHint: '在对话里让 agent 用 arena_service start 启动本地服务。',
        start: '启动服务',
        empty: '还没有可看的棋局',
        emptyHint: '让 agent 用 arena_host 开一局，或在这里刷新。',
        frameHint: '如果这段提示一直显示，说明画面没有加载成功；请用右上角“在浏览器打开”。',
        phase: { waiting: '等待入席', playing: '对局中', paused: '暂停', ended: '已结束' },
        topology: { plane: '平面', cylinder: '圆柱', torus: '环面', mobius: '莫比乌斯环', klein: '克莱因瓶', projective: '实射影平面', sphere: '球面' },
        ply: '第 {n} 手',
      },
      en: {
        panel: 'Arena',
        refresh: 'Refresh',
        open: 'Open in browser',
        select: 'Select match',
        offline: 'The arena service is not running',
        offlineHint: 'Ask the agent to run arena_service start in the conversation.',
        start: 'Start service',
        empty: 'No match to watch yet',
        emptyHint: 'Ask the agent to create one with arena_host, or refresh here.',
        frameHint: 'If this note stays visible, the page did not load; use “Open in browser”.',
        phase: { waiting: 'Lobby', playing: 'Playing', paused: 'Paused', ended: 'Finished' },
        topology: { plane: 'Plane', cylinder: 'Cylinder', torus: 'Torus', mobius: 'Möbius strip', klein: 'Klein bottle', projective: 'Projective plane', sphere: 'Sphere' },
        ply: 'ply {n}',
      },
    }

    /** Pick a message table for the active locale. */
    function tableFor(ctx) {
      try {
        const snapshot = ctx.locale.getLocale()
        const id = snapshot && typeof snapshot === 'object' ? snapshot.active || snapshot.id : null
        if (typeof id === 'string' && id.toLowerCase().startsWith('zh')) return TEXT.zh
      } catch {
        /* fall through to the default language */
      }
      return TEXT.en
    }

    /** Read the Host once; the embedded page owns its own navigation afterwards. */
    function useView() {
      const [state, setState] = React.useState({ loading: true, data: null })
      const load = React.useCallback(async () => {
        try {
          const response = await fetch(API, { headers: { accept: 'application/json' }, cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          setState({ loading: false, data })
        } catch (error) {
          setState({ loading: false, data: { url: '', running: false, games: [], selected: null, error: String(error && error.message ? error.message : error) } })
        }
      }, [])
      React.useEffect(() => {
        load()
      }, [load])
      return { ...state, reload: load }
    }

    /** The sidebar entry glyph. */
    function PanelIcon({ size }) {
      const edge = Math.max(14, size || 18)
      return h('svg', {
        width: edge, height: edge, viewBox: '0 0 24 24', 'aria-hidden': true,
        style: { display: 'block' },
      }, [
        h('path', { key: 'grid', d: 'M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16', stroke: 'currentColor', strokeWidth: 1.1, opacity: 0.55, fill: 'none' }),
        h('circle', { key: 'a', cx: 12, cy: 12, r: 3, fill: 'currentColor' }),
        h('circle', { key: 'b', cx: 16, cy: 8, r: 2.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
      ])
    }

    /** One labelled action in the panel header. */
    function headerButton(label, onClick) {
      return h('button', {
        type: 'button',
        onClick,
        style: {
          font: 'inherit', fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-primary)',
        },
      }, label)
    }

    /** The embedded arena page, framed exactly as the browser renders it. */
    function ArenaPanel({ t }) {
      const { data, reload } = useView()
      const [nonce, setNonce] = React.useState(0)
      const games = data && Array.isArray(data.games) ? data.games : []
      const active = (data && data.selected) || (games[0] && games[0].gameId) || ''
      const game = games.find((item) => item.gameId === active) || null
      const base = data && data.url ? data.url : ''
      const src = base ? `${base}/?embed=1${active ? `&game=${encodeURIComponent(active)}` : ''}` : ''
      const browserHref = base ? `${base}/${active ? `?game=${encodeURIComponent(active)}` : ''}` : ''

      const header = h('header', {
        key: 'header',
        style: {
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          borderBottom: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-1)', flex: '0 0 auto', flexWrap: 'wrap',
        },
      }, [
        h('span', { key: 'title', style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, t.panel),
        game
          ? h('span', {
              key: 'chip',
              style: {
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)',
              },
            }, `${t.topology[game.topology] || game.topology} · ${t.phase[game.phase] || game.phase} · ${t.ply.replace('{n}', String(game.ply ?? 0))}`)
          : null,
        h('div', { key: 'spacer', style: { flex: 1 } }),
        headerButton(t.refresh, () => {
          setNonce((value) => value + 1)
          reload()
        }),
        browserHref
          ? h('a', {
              key: 'open',
              href: browserHref,
              target: '_blank',
              rel: 'noreferrer',
              style: {
                fontSize: 12, padding: '5px 10px', borderRadius: 8,
                border: '1px solid var(--dsw-alias-border-l1)',
                color: 'var(--dsw-alias-label-primary)', textDecoration: 'none',
              },
            }, t.open)
          : null,
      ])

      let body
      if (data && !data.running) {
        body = h('div', { key: 'offline', style: hintStyle }, [
          h('div', { key: 'a', style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t.offline),
          h('div', { key: 'b' }, t.offlineHint),
          h('div', { key: 'c', style: { marginTop: 6 } }, headerButton(t.start, async () => {
            try {
              await fetch('/topology-arena/api/start', { method: 'POST' })
            } catch {
              /* reload reports the failure */
            }
            reload()
          })),
        ])
      } else if (!games.length) {
        body = h('div', { key: 'empty', style: hintStyle }, [
          h('div', { key: 'a', style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t.empty),
          h('div', { key: 'b' }, t.emptyHint),
        ])
      } else if (src) {
        body = [
          h('div', { key: 'hint', style: frameHintStyle }, [
            h('div', { key: 'a', style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t.panel),
            h('div', { key: 'b' }, t.frameHint),
          ]),
          h('iframe', {
            key: `frame-${active}-${nonce}`,
            src,
            title: t.panel,
            referrerPolicy: 'no-referrer',
            style: {
              position: 'absolute', inset: 0, border: 0, width: '100%', height: '100%',
              display: 'block', background: 'transparent',
            },
          }),
        ]
      } else {
        body = h('div', { key: 'loading', style: hintStyle }, t.panel)
      }

      return h('div', {
        style: { height: '100%', minHeight: '60vh', display: 'flex', flexDirection: 'column', background: 'var(--dsw-alias-bg-base)' },
      }, [header, h('div', { key: 'body', style: { flex: 1, minHeight: 0, position: 'relative' } }, body)])
    }

    const hintStyle = {
      display: 'grid', gap: 6, placeContent: 'center', padding: 32, textAlign: 'center',
      fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
    }

    const frameHintStyle = {
      position: 'absolute', inset: 0, display: 'grid', gap: 6, placeContent: 'center',
      padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--dsw-alias-label-secondary)',
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = tableFor(ctx)
        for (const locale of ['zh', 'en']) {
          try {
            ctx.locale.register(NS, locale, { panel: TEXT[locale].panel })
          } catch {
            /* the label thunk below still provides the name */
          }
        }
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, () => h(ArenaPanel, { t })))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 12,
          label: () => t.panel,
          locale: NS,
        }, PanelIcon))
      },
    }
  },
})
