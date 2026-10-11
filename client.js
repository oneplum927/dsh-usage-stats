/**
 * Browser half of the Usage Statistics bundle.
 *
 * Registers the sidebar-footer entry above the account row and the statistics
 * page it opens. The page reads the Host aggregate from the authenticated
 * `/api/usage-stats` route with a document-relative fetch, then renders totals,
 * a daily line chart, a per-model line chart, and a per-model table.
 *
 * Only the frozen platform seed table is required (`react`), so no Harness
 * Client package is imported and the bundle is dependency-free.
 */
window.__ModuleLoader__.load({
	id: '@local/dsh-usage-stats',
	factory: (require) => {
		const React = require('react');
		const h = React.createElement;

		/** Locale namespace owned by this plugin. */
		const NS = 'usageStats';
		/** Key of the statistics page inside the main column. */
		const PANEL_KEY = 'usage-stats';
		/** Document-relative form of the Host aggregate route. */
		const ENDPOINT = 'api/usage-stats';
		/** Owned stylesheet identity, reused across reloads. */
		const CSS_ID = '@local/dsh-usage-stats/usage-stats.css';

		/**
		 * Per-model line colors. Presentation belongs to the view, so the Host
		 * sends only data. The palette is exactly as long as the Host's
		 * individual-series bound, and the aggregate series takes the neutral
		 * slot beside it, so two lines never share a color.
		 */
		const SERIES_COLORS = [
			'var(--dsw-alias-brand-primary)',
			'var(--dsw-alias-state-success-primary)',
			'var(--dsw-alias-state-warn-primary)',
			'var(--dsw-alias-state-error-primary)',
			'var(--dsw-alias-state-idle-primary)',
		];
		const OTHER_COLOR = 'var(--dsw-alias-label-secondary)';

		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			entry: '使用统计',
			title: '使用统计',
			subtitle: 'DeepSeek Harness 历史 Token 用量',
			refresh: '刷新',
			loading: '正在统计…',
			loadingHint: '正在扫描全部会话日志，首次统计可能需要几秒。',
			error: '统计失败',
			retry: '重试',
			empty: '暂无用量记录',
			failedSessions: '个会话日志无法读取，已跳过。',
			total: '总 Token',
			billedInput: '计费输入',
			output: '输出 Token',
			cacheRead: '缓存命中',
			calls: '调用次数',
			sessions: '会话数',
			daily: '每日 Token 用量（合计）',
			byModel: '各模型每日 Token 用量',
			modelTable: '各模型用量',
			colModel: '模型',
			colCalls: '调用',
			colTotal: '总 Token',
			colInput: '计费输入',
			colInputHint: '未命中缓存的输入 + 缓存读 + 缓存写',
			colOutput: '输出',
			range: '范围',
			generatedAt: '统计于',
			other: '其他模型',
		};

		/** English dictionary, checked complete against the zh key set. */
		const en = {
			entry: 'Usage',
			title: 'Usage statistics',
			subtitle: 'Historical DeepSeek Harness token usage',
			refresh: 'Refresh',
			loading: 'Measuring…',
			loadingHint: 'Scanning every session log; the first pass can take a few seconds.',
			error: 'Measurement failed',
			retry: 'Retry',
			empty: 'No usage recorded yet',
			failedSessions: 'session logs could not be read and were skipped.',
			total: 'Total tokens',
			billedInput: 'Billed input',
			output: 'Output tokens',
			cacheRead: 'Cache hits',
			calls: 'Model calls',
			sessions: 'Sessions',
			daily: 'Tokens per day (total)',
			byModel: 'Tokens per day by model',
			modelTable: 'Usage by model',
			colModel: 'Model',
			colCalls: 'Calls',
			colTotal: 'Total',
			colInput: 'Billed input',
			colInputHint: 'Uncached input + cache read + cache write',
			colOutput: 'Output',
			range: 'Range',
			generatedAt: 'Measured',
			other: 'Other models',
		};

		const CSS = [
			'.dshUsageEntry{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;width:100%;min-width:0;height:42px;margin:8px 0 0;padding:0 10px 0 8px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;line-height:22px;cursor:pointer;overflow:hidden}',
			'.dshUsageEntry:hover,.dshUsageEntry[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}',
			'.dshUsageEntry:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:-2px}',
			'.dshUsageEntry[data-rail="true"]{justify-content:center;gap:0;width:36px;height:36px;margin:0;padding:0;border-radius:50%}',
			'.dshUsageEntryGlyph{flex:none}',
			'.dshUsageEntryLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.dshUsagePage{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
			'.dshUsageHeader{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 24px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}',
			'[data-platform="darwin"] .dshUsageHeader{padding-top:calc(18px + var(--dsh-frame-top-clearance,0px))}',
			'.dshUsageTitle{font-size:15px;line-height:22px;font-weight:600}',
			'.dshUsageSubtitle{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.dshUsageButton{flex:none;box-sizing:border-box;padding:5px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
			'.dshUsageButton:hover{background:var(--dsw-alias-bg-layer-2)}',
			'.dshUsageButton:disabled{color:var(--dsw-alias-label-secondary);cursor:default}',
			'.dshUsageBody{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 24px 32px}',
			// Scrolling column: children keep their content height (`flex:none`), so a
			// tall chart scrolls the column instead of being squeezed and clipped by
			// its own `overflow`. `max-width` mirrors the shipped management page.
			'.dshUsageBody>*{flex:none;width:100%;max-width:960px;min-width:0}',
			'.dshUsageCards{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px}',
			'.dshUsageCards>*{min-width:0}',
			'.dshUsageCard{padding:12px 14px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1)}',
			'.dshUsageCardLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.dshUsageCardValue{margin-top:2px;font-size:20px;line-height:28px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.dshUsageSection{padding:14px 16px 12px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
			'.dshUsageSectionTitle{margin-bottom:10px;font-size:13px;line-height:20px}',
			'.dshUsageTableWrap{max-width:100%;overflow-x:auto;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}',
			'.dshUsageChart{display:block;width:100%;height:auto;overflow:visible}',
			'.dshUsageGrid{stroke:var(--dsw-alias-border-l1);stroke-width:1;stroke-dasharray:3 4}',
			'.dshUsageAxis{fill:var(--dsw-alias-label-secondary);font-size:11px}',
			'.dshUsageLine{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}',
			'.dshUsageDot{stroke:var(--dsw-alias-bg-layer-1);stroke-width:1.5}',
			'.dshUsageHit{fill:transparent}',
			'.dshUsageLegend{display:flex;flex-wrap:wrap;gap:12px;margin-top:2px}',
			'.dshUsageLegendItem{display:flex;align-items:center;gap:6px;max-width:100%;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.dshUsageLegendLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.dshUsageSwatch{flex:none;width:10px;height:10px;border-radius:2px}',
			'.dshUsageTable{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}',
			'.dshUsageTable th{padding:6px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-weight:500;text-align:right;white-space:nowrap}',
			'.dshUsageTable td{padding:7px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l1);text-align:right;white-space:nowrap}',
			'.dshUsageTable th:first-child,.dshUsageTable td:first-child{text-align:left;max-width:320px;overflow:hidden;text-overflow:ellipsis}',
			'.dshUsageTable tr:last-child td{border-bottom:0}',
			'.dshUsageNotice{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;padding:8px 0}',
			'.dshUsageError{color:var(--dsw-alias-state-error-primary)}',
		].join('');

		/** Render localized copy through the slot-provided translator. */
		function translator(props) {
			return typeof props.t === 'function' ? props.t : (key) => key;
		}

		/** Exact, grouped integer rendering. */
		function exact(value) {
			const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
			return number.toLocaleString('en-US');
		}

		/**
		 * Short rendering for axis and headline figures: 812, 3.4K, 1.2M, 4.5B, 9.9T.
		 *
		 * Output length is bounded at four significant characters plus one unit
		 * letter, so no axis label or card value can outgrow its allocated space.
		 */
		function compact(value) {
			const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
			const magnitude = Math.abs(number);
			const scale = magnitude >= 1e12 ? 1e12 : magnitude >= 1e9 ? 1e9 : magnitude >= 1e6 ? 1e6 : magnitude >= 1e3 ? 1e3 : 1;
			const unit = scale === 1e12 ? 'T' : scale === 1e9 ? 'B' : scale === 1e6 ? 'M' : scale === 1e3 ? 'K' : '';
			if (scale === 1) return String(Math.round(number));
			const scaled = number / scale;
			return `${Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/u, '')}${unit}`;
		}

		/** Longest exact figure that still fits one statistic card. */
		const HEADLINE_BUDGET = 11;

		/**
		 * Card face: the exact grouped figure while it fits, otherwise a compact
		 * form, so a growing total never widens the card grid. The exact figure
		 * always stays reachable through the element's tooltip.
		 */
		function headline(value) {
			const text = exact(value);
			return text.length <= HEADLINE_BUDGET ? text : compact(value);
		}

		/** Localized `YYYY-MM-DD HH:mm` of one epoch-millisecond stamp. */
		function stamp(value) {
			const date = new Date(typeof value === 'number' ? value : Number.NaN);
			if (Number.isNaN(date.getTime())) return '—';
			const pad = (part) => String(part).padStart(2, '0');
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}

		/** Billed prompt tokens: uncached input plus both cache directions. */
		function billedInput(bucket) {
			return (bucket?.inputTokens ?? 0) + (bucket?.cacheReadTokens ?? 0) + (bucket?.cacheWriteTokens ?? 0);
		}

		/** Bottom-left bar-chart glyph drawn from the current text color. */
		function Glyph(props) {
			const size = props.size ?? 16;
			return h(
				'svg',
				{
					className: 'dshUsageEntryGlyph',
					width: size,
					height: size,
					viewBox: '0 0 16 16',
					'aria-hidden': true,
					focusable: false,
				},
				h('rect', { x: 1.5, y: 8.5, width: 3, height: 6, rx: 1, fill: 'currentColor' }),
				h('rect', { x: 6.5, y: 4.5, width: 3, height: 10, rx: 1, fill: 'currentColor' }),
				h('rect', { x: 11.5, y: 1.5, width: 3, height: 13, rx: 1, fill: 'currentColor' }),
			);
		}

		/** The sidebar-footer entry that toggles the statistics page. */
		function UsageEntry(props) {
			const t = translator(props);
			const wide = props.wide !== false;
			const usePanelInfo = props.usePanelInfo;
			const active = typeof usePanelInfo === 'function' ? usePanelInfo((info) => info.activePanelId === PANEL_KEY) : false;
			return h(
				'button',
				{
					type: 'button',
					className: 'dshUsageEntry',
					'data-rail': wide ? 'false' : 'true',
					'data-active': active ? 'true' : 'false',
					title: t('entry'),
					'aria-label': t('entry'),
					'aria-current': active ? 'page' : undefined,
					onClick: () => props.togglePanel(),
				},
				h(Glyph, { size: wide ? 16 : 18 }),
				wide ? h('span', { className: 'dshUsageEntryLabel' }, t('entry')) : null,
			);
		}

		/** Fetch the Host aggregate once on mount, then only on demand. */
		function useAggregate() {
			const [state, setState] = React.useState({ phase: 'loading', data: null, error: null });
			const load = React.useCallback((refresh) => {
				setState((previous) => ({ phase: previous.data === null ? 'loading' : 'refreshing', data: previous.data, error: null }));
				fetch(refresh ? `${ENDPOINT}?refresh=1` : ENDPOINT, { headers: { accept: 'application/json' } })
					.then((response) => {
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						return response.json();
					})
					.then((payload) => {
						if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
							throw new Error(payload?.error ?? 'malformed payload');
						}
						setState({ phase: 'ready', data: payload, error: null });
					})
					.catch((error) => {
						setState((previous) => ({
							phase: 'error',
							data: previous.data,
							error: error instanceof Error ? error.message : String(error),
						}));
					});
			}, []);
			React.useEffect(() => {
				load(false);
			}, [load]);
			return [state, load];
		}

		/**
		 * Monotone cubic (Fritsch–Carlson) Bézier path through every point.
		 *
		 * The curve passes exactly through each data point and — because tangent
		 * slopes are clamped to the neighboring segment slopes — never overshoots
		 * the data range, so smoothing cannot invent values between samples.
		 * `points` are `[x, y]` pairs with strictly increasing x.
		 * @returns an SVG `d` string, or null when fewer than two points exist.
		 */
		function smoothPath(points) {
			const n = points.length;
			if (n < 2) return null;
			const round = (value) => Math.round(value * 100) / 100;
			if (n === 2) return `M ${round(points[0][0])} ${round(points[0][1])} L ${round(points[1][0])} ${round(points[1][1])}`;
			const deltas = [];
			const slopes = [];
			for (let i = 0; i < n - 1; i++) {
				deltas[i] = points[i + 1][0] - points[i][0];
				slopes[i] = (points[i + 1][1] - points[i][1]) / deltas[i];
			}
			const tangents = [slopes[0]];
			for (let i = 1; i < n - 1; i++) {
				if (slopes[i - 1] * slopes[i] <= 0) tangents[i] = 0;
				else {
					const weightIn = 2 * deltas[i] + deltas[i - 1];
					const weightOut = deltas[i] + 2 * deltas[i - 1];
					tangents[i] = (weightIn + weightOut) / (weightIn / slopes[i - 1] + weightOut / slopes[i]);
				}
			}
			tangents[n - 1] = slopes[n - 2];
			let d = `M ${round(points[0][0])} ${round(points[0][1])}`;
			for (let i = 0; i < n - 1; i++) {
				const third = deltas[i] / 3;
				d += ` C ${round(points[i][0] + third)} ${round(points[i][1] + tangents[i] * third)}, ${round(points[i + 1][0] - third)} ${round(points[i + 1][1] - tangents[i + 1] * third)}, ${round(points[i + 1][0])} ${round(points[i + 1][1])}`;
			}
			return d;
		}

		/**
		 * One SVG line chart over a shared date axis.
		 * @param props - axis labels, series with aligned values, and formatters.
		 */
		function LineChart(props) {
			const width = 760;
			const height = 240;
			const padTop = 18;
			const padRight = 18;
			const padBottom = 34;
			const padLeft = 62;
			const plotWidth = width - padLeft - padRight;
			const plotHeight = height - padTop - padBottom;
			const labels = props.labels;
			const series = props.series;
			const count = labels.length;

			let max = 0;
			for (const line of series) for (const value of line.values) if (value > max) max = value;
			if (!(max > 0)) max = 1;

			const xAt = (index) => (count <= 1 ? padLeft + plotWidth / 2 : padLeft + (index * plotWidth) / (count - 1));
			const yAt = (value) => padTop + plotHeight - (value / max) * plotHeight;
			const step = Math.max(1, Math.ceil(count / 6));
			const ticks = [0, 0.25, 0.5, 0.75, 1];

			return h(
				'svg',
				{
					className: 'dshUsageChart',
					viewBox: `0 0 ${width} ${height}`,
					role: 'img',
					'aria-label': props.ariaLabel,
				},
				ticks.map((tick, index) =>
					h(
						'g',
						{ key: `grid-${index}` },
						h('line', { className: 'dshUsageGrid', x1: padLeft, x2: padLeft + plotWidth, y1: padTop + plotHeight * tick, y2: padTop + plotHeight * tick }),
						h('text', { className: 'dshUsageAxis', x: padLeft - 8, y: padTop + plotHeight * tick + 4, textAnchor: 'end' }, compact(max * (1 - tick))),
					),
				),
				labels.map((label, index) =>
					index % step === 0 || index === count - 1
						? h(
								'text',
								{
									key: `label-${label}`,
									className: 'dshUsageAxis',
									x: xAt(index),
									y: height - 10,
									textAnchor: index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle',
								},
								label.length > 5 ? label.slice(5) : label,
							)
						: null,
				),
				series.map((line) =>
					h(
						'g',
						{ key: `line-${line.key}` },
						h('path', {
							className: 'dshUsageLine',
							style: line.dashed === true ? { stroke: line.color, strokeDasharray: '5 4' } : { stroke: line.color },
							d: smoothPath(line.values.map((value, index) => [xAt(index), yAt(value)])),
						}),
						count <= 60
							? line.values.map((value, index) =>
									h(
										'g',
										{ key: `pt-${index}` },
										h('circle', { className: 'dshUsageDot', cx: xAt(index), cy: yAt(value), r: 3, style: { fill: line.color } }),
										h(
											'circle',
											{ className: 'dshUsageHit', cx: xAt(index), cy: yAt(value), r: 7 },
											h('title', null, `${labels[index]} · ${line.label}: ${exact(value)}`),
										),
									),
								)
							: null,
					),
				),
			);
		}

		/** One card row of headline figures. */
		function StatCards(props) {
			return h(
				'div',
				{ className: 'dshUsageCards' },
				props.cards.map((card) =>
					h(
						'div',
						{ className: 'dshUsageCard', key: card.label },
						h('div', { className: 'dshUsageCardLabel' }, card.label),
						h('div', { className: 'dshUsageCardValue', title: card.exact }, card.value),
					),
				),
			);
		}

		/** The statistics page rendered in the main column. */
		function UsagePage(props) {
			const t = translator(props);
			const [state, load] = useAggregate();
			const data = state.data;
			const totals = data?.totals;

			const header = h(
				'div',
				{ className: 'dshUsageHeader' },
				h(
					'div',
					null,
					h('div', { className: 'dshUsageTitle' }, t('title')),
					h('div', { className: 'dshUsageSubtitle' }, t('subtitle')),
				),
				h(
					'button',
					{
						type: 'button',
						className: 'dshUsageButton',
						disabled: state.phase === 'loading' || state.phase === 'refreshing',
						onClick: () => load(true),
					},
					state.phase === 'loading' || state.phase === 'refreshing' ? t('loading') : t('refresh'),
				),
			);

			if (data === null) {
				return h(
					'div',
					{ className: 'dshUsagePage' },
					header,
					h(
						'div',
						{ className: 'dshUsageBody' },
						state.phase === 'error'
							? h(
									'div',
									{ className: 'dshUsageNotice dshUsageError' },
									`${t('error')}: ${state.error}`,
									h('div', null, h('button', { type: 'button', className: 'dshUsageButton', style: { marginTop: '10px' }, onClick: () => load(true) }, t('retry'))),
								)
							: h('div', { className: 'dshUsageNotice' }, t('loading'), h('div', null, t('loadingHint'))),
					),
				);
			}

			const models = Array.isArray(data.models) ? data.models : [];
			const days = Array.isArray(data.days) ? data.days : [];
			const series = Array.isArray(data.series) ? data.series : [];
			const labels = days.map((row) => row.date);
			const dailySeries = [
				{
					key: 'total',
					label: t('daily'),
					color: SERIES_COLORS[0],
					values: days.map((row) => row.totalTokens ?? 0),
				},
			];
			const modelSeries = series.map((line, index) => ({
				key: line.key,
				label: line.other === true ? t('other') : line.key,
				color: line.other === true ? OTHER_COLOR : SERIES_COLORS[index % SERIES_COLORS.length],
				dashed: line.other === true,
				values: Array.isArray(line.values) ? line.values : [],
			}));

			const cards = [
				{ label: t('total'), value: headline(totals?.totalTokens), exact: exact(totals?.totalTokens) },
				{ label: t('billedInput'), value: headline(billedInput(totals)), exact: exact(billedInput(totals)) },
				{ label: t('output'), value: headline(totals?.outputTokens), exact: exact(totals?.outputTokens) },
				{ label: t('cacheRead'), value: headline(totals?.cacheReadTokens), exact: exact(totals?.cacheReadTokens) },
				{ label: t('calls'), value: headline(totals?.calls), exact: exact(totals?.calls) },
				{ label: t('sessions'), value: headline(data.scanned?.sessions), exact: exact(data.scanned?.sessions) },
			];

			const meta = [
				data.scanned?.firstDay !== null && data.scanned?.firstDay !== undefined
					? `${t('range')}: ${data.scanned.firstDay} → ${data.scanned.lastDay}`
					: null,
				`${t('generatedAt')}: ${stamp(data.generatedAt)}`,
				data.scanned?.unreadableSessions > 0 ? `${data.scanned.unreadableSessions} ${t('failedSessions')}` : null,
				state.phase === 'error' ? `${t('error')}: ${state.error}` : null,
			].filter((line) => line !== null);

			return h(
				'div',
				{ className: 'dshUsagePage' },
				header,
				h(
					'div',
					{ className: 'dshUsageBody' },
					h(StatCards, { t: props.t, cards }),
					models.length === 0
						? h('div', { className: 'dshUsageNotice' }, t('empty'))
						: h(
								'div',
								{ className: 'dshUsageSection' },
								h('div', { className: 'dshUsageSectionTitle' }, t('daily')),
								h(LineChart, { labels, series: dailySeries, ariaLabel: t('daily') }),
							),
					models.length === 0 || labels.length === 0
						? null
						: h(
								'div',
								{ className: 'dshUsageSection' },
								h('div', { className: 'dshUsageSectionTitle' }, t('byModel')),
								h(LineChart, { labels, series: modelSeries, ariaLabel: t('byModel') }),
								h(
									'div',
									{ className: 'dshUsageLegend' },
									modelSeries.map((line) =>
										h(
											'div',
											{ className: 'dshUsageLegendItem', key: line.key },
											h('span', { className: 'dshUsageSwatch', style: { background: line.color } }),
											h('span', { className: 'dshUsageLegendLabel', title: line.label }, line.label),
										),
									),
								),
							),
					models.length === 0
						? null
						: h(
								'div',
								{ className: 'dshUsageSection' },
								h('div', { className: 'dshUsageSectionTitle' }, t('modelTable')),
								h(
									'div',
									{ className: 'dshUsageTableWrap' },
									h(
										'table',
										{ className: 'dshUsageTable' },
										h(
											'thead',
											null,
											h(
												'tr',
												null,
												h('th', null, t('colModel')),
												h('th', null, t('colCalls')),
												h('th', null, t('colTotal')),
												h('th', { title: t('colInputHint') }, t('colInput')),
												h('th', null, t('colOutput')),
											),
										),
										h(
											'tbody',
											null,
											models.map((model) =>
												h(
													'tr',
													{ key: model.key },
													h('td', { title: model.key }, model.key),
													h('td', null, exact(model.calls)),
													h('td', null, exact(model.totalTokens)),
													h('td', null, exact(billedInput(model))),
													h('td', null, exact(model.outputTokens)),
												),
											),
										),
									),
								),
							),
					meta.length === 0
						? null
						: h(
								'div',
								{ className: 'dshUsageNotice' },
								meta.map((line, index) => h('div', { key: `meta-${index}` }, line)),
							),
				),
			);
		}

		/** Client services required by this plugin. */
		const inject = ['slots', 'layout', 'locale'];

		/**
		 * Register the dictionaries, the owned stylesheet, the statistics page,
		 * and the sidebar-footer entry above the account row.
		 * @param ctx - browser plugin context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-stats: dictionaries');
			const t = ctx.locale.bind(NS);

			ctx.effect(() => {
				const tag = document.createElement('style');
				tag.dataset.plugin = '@local/dsh-usage-stats';
				tag.dataset.pluginCss = CSS_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, 'usage-stats: styles');

			/** Show this page, or return to the Conversation when it is already active. */
			const togglePanel = () => {
				const current = ctx.layout.panelInfo.getSnapshot().activePanelId;
				ctx.layout.selectPanel(current === PANEL_KEY ? null : PANEL_KEY);
			};

			ctx.slots.inject('main', () =>
				ctx.slots.register(
					{
						name: 'main',
						key: PANEL_KEY,
						locale: NS,
					},
					UsagePage,
				),
			);

			ctx.slots.inject('sidebar.footer.action', () =>
				ctx.slots.register(
					{
						name: 'sidebar.footer.action',
						id: PANEL_KEY,
						order: -10,
						label: () => t('entry'),
						locale: NS,
						inject: () => ({ togglePanel }),
					},
					UsageEntry,
				),
			);
		}

		return { inject, apply };
	},
});
