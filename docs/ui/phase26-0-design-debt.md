# 26-0 디자인 금지 규칙 자동 점검

- 생성 시각: 2026-08-25T15:11:58.307Z
- 검사한 CSS: 33개
- 위반이 남은 CSS: 20개
- 총 자동 탐지 부채 | 528건

## 규칙별 현황

| 규칙 | 설명 | 현재 건수 |
|---|---|---:|
| `decorative-gradient` | 장식용 그라데이션 | 248 |
| `border-and-shadow` | 테두리와 큰 그림자 중복 | 148 |
| `radial-glow` | 방사형 글로우·헤이즈 | 45 |
| `thick-side-accent` | 굵은 한쪽 컬러 보더 | 38 |
| `oversized-card-radius` | 작은 카드의 과한 라운드 | 26 |
| `glass-blur` | 글래스·블러 효과 | 20 |
| `decorative-eyebrow` | 장식용 영문 아이브로우 | 3 |
| `banned-font` | 금지 폰트 | 0 |
| `cream-base` | 크림·베이지 기본 배경 | 0 |
| `dark-cyan-neon` | 어두운 배경과 시안 네온 | 0 |
| `gradient-text` | 그라데이션 글자 | 0 |

## 발견 위치

| 위치 | 규칙 | 선택자 |
|---|---|---|
| `app/_analysis/harin-analysis-v8.css:3` | `decorative-gradient` | `.productAdTargetsHero` |
| `app/_analysis/harin-analysis-v8.css:3` | `radial-glow` | `.productAdTargetsHero` |
| `app/_analysis/harin-analysis-v8.css:3` | `thick-side-accent` | `.productAdTargetRow` |
| `app/_analysis/harin-analysis-v8.css:8` | `oversized-card-radius` | `.cafe24Catalog .productCard>div:last-child>span` |
| `app/_analysis/harin-analysis-v8.css:12` | `border-and-shadow` | `/* Phase 23-4A: dense product costs become a paged list with one detail editor. */ .productCostWorkbench` |
| `app/_analysis/harin-analysis-v8.css:12` | `decorative-gradient` | `/* Phase 23-4A: dense product costs become a paged list with one detail editor. */ .productCostWorkbench` |
| `app/_analysis/harin-analysis-v8.css:15` | `thick-side-accent` | `.productCostList>button.active` |
| `app/_analysis/harin-analysis-v8.css:23` | `decorative-gradient` | `.productCostProgress` |
| `app/_analysis/harin-analysis-v8.css:23` | `decorative-gradient` | `.productCostProgress>i>em` |
| `app/_analysis/harin-analysis-v8.css:25` | `thick-side-accent` | `.productCostQuickRows>article.dirty` |
| `app/_analysis/harin-analysis-v8.css:32` | `border-and-shadow` | `.analysisHero` |
| `app/_analysis/harin-analysis-v8.css:32` | `decorative-gradient` | `.analysisHero` |
| `app/_analysis/harin-analysis-v8.css:32` | `radial-glow` | `.analysisHero` |
| `app/_analysis/harin-analysis-v8.css:33` | `decorative-gradient` | `.analysisV8-keyword .analysisHero` |
| `app/_analysis/harin-analysis-v8.css:33` | `decorative-gradient` | `.analysisV8-product .analysisHero` |
| `app/_analysis/harin-analysis-v8.css:33` | `radial-glow` | `.analysisV8-keyword .analysisHero` |
| `app/_analysis/harin-analysis-v8.css:33` | `radial-glow` | `.analysisV8-product .analysisHero` |
| `app/_analysis/harin-analysis-v8.css:39` | `border-and-shadow` | `.analysisCompareCard,.analysisAnomalyCard,.keywordDecisionDesk,.productDifferenceDesk` |
| `app/_analysis/harin-analysis-v8.css:39` | `oversized-card-radius` | `.analysisCompareCard header>em,.analysisAnomalyCard header>em,.productDifferenceDesk header>em` |
| `app/_analysis/harin-analysis-v8.css:44` | `decorative-gradient` | `.keywordDecisionDesk` |
| `app/_analysis/harin-analysis-v8.css:45` | `decorative-gradient` | `.productDifferenceDesk` |
| `app/_analysis/harin-analysis-v8.css:48` | `border-and-shadow` | `.insightOverviewDesk,.insightCauseDesk,.insightChannelDesk,.insightProfitDesk` |
| `app/_analysis/harin-analysis-v8.css:48` | `decorative-gradient` | `.insightOverviewDesk,.insightCauseDesk,.insightChannelDesk,.insightProfitDesk` |
| `app/_analysis/harin-analysis-v8.css:54` | `decorative-gradient` | `.profitWaterfall article>div>i` |
| `app/_analysis/harin-analysis-v8.css:54` | `decorative-gradient` | `.profitWaterfall article.cost>div>i` |
| `app/_analysis/harin-analysis-v8.css:55` | `border-and-shadow` | `.analysisDetailDisclosure` |
| `app/_analysis/harin-analysis-v8.css:83` | `border-and-shadow` | `.keywordOpsHeader` |
| `app/_analysis/harin-analysis-v8.css:83` | `border-and-shadow` | `.keywordOpsSummary>span` |
| `app/_analysis/harin-analysis-v8.css:83` | `border-and-shadow` | `.keywordOpsToolbar` |
| `app/_analysis/harin-analysis-v8.css:83` | `border-and-shadow` | `.keywordOpsTableWrap` |
| `app/_analysis/harin-analysis-v8.css:83` | `border-and-shadow` | `.keywordOpsDetail` |
| `app/_analysis/harin-analysis-v8.css:83` | `decorative-gradient` | `.keywordOpsHeader` |
| `app/_analysis/harin-analysis-v8.css:83` | `radial-glow` | `.keywordOpsHeader` |
| `app/_analysis/harin-analysis-v8.css:83` | `thick-side-accent` | `.keywordOpsRow:not(.head):hover` |
| `app/_analysis/harin-analysis-v8.css:83` | `thick-side-accent` | `.keywordOpsRow.changed` |
| `app/_analysis/harin-analysis-v8.css:85` | `border-and-shadow` | `.keywordOpsRow:not(.head)` |
| `app/_analysis/harin-analysis-v8.css:85` | `border-and-shadow` | `.keywordOpsMobileAction` |
| `app/_analysis/harin-analysis-v8.css:85` | `glass-blur` | `.keywordOpsMobileAction` |
| `app/_analysis/harin-analysis-v8.css:97` | `glass-blur` | `/* Phase 15-5: owner-approved Naver bid preview and live verification flow. */ .keywordOpsReviewBackdrop` |
| `app/_analysis/harin-analysis-v8.css:98` | `border-and-shadow` | `.keywordOpsReview` |
| `app/_analysis/harin-analysis-v8.css:98` | `decorative-gradient` | `.keywordOpsReview` |
| `app/_analysis/harin-analysis-v8.css:108` | `border-and-shadow` | `/* Phase 23-5: a server-built owner brief connects change, cause and next action. */ .insightDecisionBrief` |
| `app/_analysis/harin-analysis-v8.css:108` | `decorative-gradient` | `/* Phase 23-5: a server-built owner brief connects change, cause and next action. */ .insightDecisionBrief` |
| `app/_analysis/harin-analysis-v8.css:108` | `radial-glow` | `/* Phase 23-5: a server-built owner brief connects change, cause and next action. */ .insightDecisionBrief` |
| `app/_analysis/harin-analysis-v8.css:118` | `border-and-shadow` | `/* Phase 15-6: Coupang-only WING worklist. Public seller Open API writes stay locked. */ .keywordOpsCapability` |
| `app/_analysis/harin-analysis-v8.css:118` | `decorative-gradient` | `/* Phase 15-6: Coupang-only WING worklist. Public seller Open API writes stay locked. */ .keywordOpsCapability` |
| `app/_analysis/harin-analysis-v8.css:119` | `decorative-gradient` | `.keywordOpsWing` |
| `app/_analysis/harin-analysis-v8.css:138` | `border-and-shadow` | `.keywordOpsContextStrip` |
| `app/_analysis/harin-analysis-v8.css:147` | `border-and-shadow` | `/* Phase 24-2: Naver-only campaign and adgroup bid workspace. */ .keywordOpsAdgroupWorkspace` |
| `app/_analysis/harin-analysis-v8.css:147` | `decorative-gradient` | `/* Phase 24-2: Naver-only campaign and adgroup bid workspace. */ .keywordOpsAdgroupWorkspace` |
| `app/_analysis/harin-analysis-v8.css:147` | `radial-glow` | `/* Phase 24-2: Naver-only campaign and adgroup bid workspace. */ .keywordOpsAdgroupWorkspace` |
| `app/_analysis/harin-analysis-v8.css:158` | `border-and-shadow` | `/* Phase 24-8: one-glance view state and mobile-safe keyword operations finish. */ .keywordOpsViewState` |
| `app/_analysis/harin-analysis-v8.css:164` | `decorative-gradient` | `.keywordOpsViewState.active` |
| `app/_analysis/harin-analysis-v8.css:165` | `thick-side-accent` | `.keywordOpsRow[tabindex="0"]:focus-visible` |
| `app/_analysis/harin-analysis-v8.css:171` | `decorative-gradient` | `.keywordOpsRankSignal.loading i` |
| `app/_analysis/harin-analysis-v8.css:178` | `decorative-gradient` | `.adCategoryBadge.inactive` |
| `app/_analysis/harin-analysis-v8.css:179` | `decorative-gradient` | `.keywordOpsAdgroupRail button.inactive` |
| `app/_analysis/harin-analysis-v8.css:182` | `decorative-gradient` | `.keywordOpsInactiveNotice` |
| `app/_analysis/harin-analysis-v8.css:188` | `decorative-gradient` | `.keywordOpsNaverSearch` |
| `app/_analysis/harin-analysis-v8.css:202` | `decorative-gradient` | `.keywordOpsSearch .keywordOpsSearchInput>input` |
| `app/_analysis/harin-analysis-v8.css:203` | `border-and-shadow` | `.keywordOpsFinderResults` |
| `app/_analysis/harin-analysis-v8.css:203` | `decorative-gradient` | `.keywordOpsFinderResults>header` |
| `app/_analysis/harin-analysis-v8.css:203` | `decorative-gradient` | `.keywordOpsFinderResults>button.active,.keywordOpsFinderResults>button:hover` |
| `app/_analysis/harin-analysis-v8.css:203` | `decorative-gradient` | `.keywordOpsRow.inspected` |
| `app/_analysis/harin-analysis-v8.css:203` | `glass-blur` | `.keywordOpsFinderResults` |
| `app/_analysis/harin-analysis-v8.css:203` | `thick-side-accent` | `.keywordOpsFinderResults>button.active,.keywordOpsFinderResults>button:hover` |
| `app/_analysis/harin-analysis-v8.css:203` | `thick-side-accent` | `.keywordOpsRow.inspected` |
| `app/_analysis/harin-analysis-v8.css:209` | `border-and-shadow` | `/* Phase 25-3: condition selection and bulk bid drafting stay local until final review. */ .keywordOpsBulkStudio` |
| `app/_analysis/harin-analysis-v8.css:209` | `decorative-gradient` | `/* Phase 25-3: condition selection and bulk bid drafting stay local until final review. */ .keywordOpsBulkStudio` |
| `app/_analysis/harin-analysis-v8.css:211` | `decorative-gradient` | `.keywordOpsBulkStudioFlow button.apply` |
| `app/_analysis/harin-analysis-v8.css:219` | `border-and-shadow` | `/* Phase 25-4: Naver-only device and region operating scope, backed by actual breakdown rows. */ .keywordOperatingScope` |
| `app/_analysis/harin-analysis-v8.css:219` | `decorative-gradient` | `/* Phase 25-4: Naver-only device and region operating scope, backed by actual breakdown rows. */ .keywordOperatingScope` |
| `app/_analysis/harin-analysis-v8.css:219` | `radial-glow` | `/* Phase 25-4: Naver-only device and region operating scope, backed by actual breakdown rows. */ .keywordOperatingScope` |
| `app/_analysis/harin-analysis-v8.css:220` | `decorative-gradient` | `.keywordOperatingHeading>i` |
| `app/_analysis/harin-analysis-v8.css:221` | `decorative-gradient` | `.keywordOperatingSwitch button.active` |
| `app/_analysis/harin-analysis-v8.css:222` | `decorative-gradient` | `.keywordDeviceCard` |
| `app/_analysis/harin-analysis-v8.css:222` | `decorative-gradient` | `.keywordDeviceCard.mobile` |
| `app/_analysis/harin-analysis-v8.css:223` | `decorative-gradient` | `.keywordRegionScope>article` |
| `app/_analysis/harin-analysis-v8.css:225` | `decorative-gradient` | `.keywordOperatingSkeleton>i` |
| `app/_analysis/harin-analysis-v8.css:235` | `decorative-gradient` | `.keywordHourCell.heat-5` |
| `app/_analysis/harin-market-intelligence.css:4` | `border-and-shadow` | `.marketDeferredWorkbench` |
| `app/_analysis/harin-market-intelligence.css:4` | `decorative-gradient` | `.marketDeferredWorkbench` |
| `app/_analysis/harin-market-intelligence.css:8` | `decorative-gradient` | `.marketWorkbenchError` |
| `app/_analysis/harin-market-intelligence.css:29` | `decorative-gradient` | `.harinV8 .marketWorkspaceTabs>a.active` |
| `app/_analysis/harin-market-intelligence.css:38` | `decorative-gradient` | `.harinV8 .b2bFlowRail>article` |
| `app/_analysis/harin-market-intelligence.css:39` | `border-and-shadow` | `.harinV8 .b2bOpportunitySection` |
| `app/_analysis/harin-market-intelligence.css:41` | `decorative-gradient` | `.harinV8 .b2bConnectionCard` |
| `app/_analysis/harin-market-intelligence.css:48` | `border-and-shadow` | `/* Phase 17-9: product-isolated page AI and NCLUE readiness pilot. */ .harinV8 .marketPageAi` |
| `app/_analysis/harin-market-intelligence.css:48` | `decorative-gradient` | `/* Phase 17-9: product-isolated page AI and NCLUE readiness pilot. */ .harinV8 .marketPageAi` |
| `app/_analysis/harin-market-intelligence.css:54` | `decorative-gradient` | `.harinV8 .ncluePilot` |
| `app/_analysis/harin-market-intelligence.css:62` | `decorative-gradient` | `.harinV8 .marketDataMessage` |
| `app/_analysis/harin-market-intelligence.css:64` | `decorative-gradient` | `.harinV8 .marketDropzone` |
| `app/_analysis/harin-market-intelligence.css:67` | `border-and-shadow` | `.harinV8 .marketEvidenceLibrary` |
| `app/_analysis/harin-market-intelligence.css:73` | `border-and-shadow` | `/* Phase 18-5 · owner-reviewed NAVER public Evidence candidates. */ .harinV8 .marketNaverEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:73` | `decorative-gradient` | `/* Phase 18-5 · owner-reviewed NAVER public Evidence candidates. */ .harinV8 .marketNaverEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:81` | `border-and-shadow` | `/* Phase 19-2 · product-isolated FoodSafetyKorea, recall and Korean law Evidence. */ .harinV8 .marketOfficialEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:81` | `decorative-gradient` | `/* Phase 19-2 · product-isolated FoodSafetyKorea, recall and Korean law Evidence. */ .harinV8 .marketOfficialEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:82` | `decorative-gradient` | `.harinV8 .marketOfficialEvidenceControl` |
| `app/_analysis/harin-market-intelligence.css:91` | `border-and-shadow` | `/* Phase 20-1 · product-isolated PubMed, ClinicalTrials.gov and Crossref Evidence. */ .harinV8 .marketResearchEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:91` | `decorative-gradient` | `/* Phase 20-1 · product-isolated PubMed, ClinicalTrials.gov and Crossref Evidence. */ .harinV8 .marketResearchEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:92` | `decorative-gradient` | `.harinV8 .marketResearchEvidenceGuardrail` |
| `app/_analysis/harin-market-intelligence.css:93` | `decorative-gradient` | `.harinV8 .marketResearchEvidenceControl` |
| `app/_analysis/harin-market-intelligence.css:109` | `decorative-gradient` | `.harinV8 .marketScopeLevels>button` |
| `app/_analysis/harin-market-intelligence.css:122` | `decorative-gradient` | `.harinV8 .marketCompetitorList article` |
| `app/_analysis/harin-market-intelligence.css:124` | `decorative-gradient` | `.harinV8 .marketAppealFlow>section` |
| `app/_analysis/harin-market-intelligence.css:133` | `decorative-gradient` | `.harinV8 .marketFunnelStepWrap>article` |
| `app/_analysis/harin-market-intelligence.css:135` | `decorative-gradient` | `.harinV8 .marketBarrierGrid>button` |
| `app/_analysis/harin-market-intelligence.css:145` | `decorative-gradient` | `.harinV8 .marketGrowthStepWrap>button` |
| `app/_analysis/harin-market-intelligence.css:146` | `decorative-gradient` | `.harinV8 .marketGrowthActiveSignal` |
| `app/_analysis/harin-market-intelligence.css:148` | `decorative-gradient` | `.harinV8 .marketRetentionStats>span` |
| `app/_analysis/harin-market-intelligence.css:156` | `decorative-gradient` | `.harinV8 .marketExecutionStepWrap>article.done` |
| `app/_analysis/harin-market-intelligence.css:158` | `decorative-gradient` | `.harinV8 .marketExecutionActionGrid>article` |
| `app/_analysis/harin-market-intelligence.css:165` | `decorative-gradient` | `.harinV8 .marketTrendControl` |
| `app/_analysis/harin-market-intelligence.css:168` | `decorative-gradient` | `.harinV8 .marketTrendPanel.stale` |
| `app/_analysis/harin-market-intelligence.css:176` | `decorative-gradient` | `.harinV8 .marketAdResearchControl` |
| `app/_analysis/harin-market-intelligence.css:179` | `decorative-gradient` | `.harinV8 .marketAdKeywordTable>label.selected` |
| `app/_analysis/harin-market-intelligence.css:179` | `thick-side-accent` | `.harinV8 .marketAdKeywordTable>label.selected` |
| `app/_analysis/harin-market-intelligence.css:180` | `decorative-gradient` | `.harinV8 .marketAdEstimatePanel.stale` |
| `app/_analysis/harin-market-intelligence.css:188` | `decorative-gradient` | `.harinV8 .marketCommerceFlow` |
| `app/_analysis/harin-market-intelligence.css:195` | `border-and-shadow` | `/* Phase 19-5 · product-isolated KAMIS, KMA and YouTube public context Evidence. */ .harinV8 .marketContextEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:195` | `decorative-gradient` | `/* Phase 19-5 · product-isolated KAMIS, KMA and YouTube public context Evidence. */ .harinV8 .marketContextEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:196` | `decorative-gradient` | `.harinV8 .marketContextEvidenceControl` |
| `app/_analysis/harin-market-intelligence.css:206` | `border-and-shadow` | `/* Phase 20-2 · product-isolated MFDS, HACCP, ingredient and USDA label cross-check. */ .harinV8 .marketLabelEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:206` | `decorative-gradient` | `/* Phase 20-2 · product-isolated MFDS, HACCP, ingredient and USDA label cross-check. */ .harinV8 .marketLabelEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:207` | `decorative-gradient` | `.harinV8 .marketLabelEvidenceGuardrail` |
| `app/_analysis/harin-market-intelligence.css:208` | `decorative-gradient` | `.harinV8 .marketLabelEvidenceControl` |
| `app/_analysis/harin-market-intelligence.css:218` | `border-and-shadow` | `/* Phase 20-3 · product-isolated Customs, Korea Eximbank and KOSIS market context. */ .harinV8 .rawMarketEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:218` | `decorative-gradient` | `/* Phase 20-3 · product-isolated Customs, Korea Eximbank and KOSIS market context. */ .harinV8 .rawMarketEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:218` | `radial-glow` | `/* Phase 20-3 · product-isolated Customs, Korea Eximbank and KOSIS market context. */ .harinV8 .rawMarketEvidenceWorkbench` |
| `app/_analysis/harin-market-intelligence.css:219` | `decorative-gradient` | `.harinV8 .rawMarketEvidenceGuardrail` |
| `app/_analysis/harin-market-intelligence.css:220` | `decorative-gradient` | `.harinV8 .rawMarketEvidenceControl` |
| `app/_analysis/keyword-bid-capability-panel.css:1` | `border-and-shadow` | `.keywordCapabilityPanel` |
| `app/_analysis/keyword-bid-capability-panel.css:1` | `decorative-gradient` | `.keywordCapabilityPanel` |
| `app/_analysis/keyword-bid-capability-panel.css:1` | `radial-glow` | `.keywordCapabilityPanel` |
| `app/_analysis/keyword-bid-capability-panel.css:8` | `decorative-gradient` | `.keywordCapabilityAcceptance` |
| `app/_analysis/keyword-bid-history-panel.css:1` | `decorative-gradient` | `.keywordBidHistory` |
| `app/_analysis/keyword-bid-inline-trend.css:1` | `decorative-gradient` | `.keywordBidInlineTrend` |
| `app/_analysis/keyword-bid-inline-trend.css:7` | `decorative-gradient` | `.keywordBidOfficialEvidence` |
| `app/_analysis/keyword-bid-operations-overview.css:1` | `border-and-shadow` | `.bidOperationsOverview` |
| `app/_analysis/keyword-bid-operations-overview.css:1` | `decorative-gradient` | `.bidOperationsOverview` |
| `app/_analysis/keyword-bid-operations-overview.css:1` | `radial-glow` | `.bidOperationsOverview` |
| `app/_analysis/keyword-bid-rule-panel.css:1` | `border-and-shadow` | `.bidRulePanel` |
| `app/_analysis/keyword-bid-rule-panel.css:1` | `decorative-gradient` | `.bidRulePanel` |
| `app/_analysis/keyword-bid-rule-panel.css:1` | `glass-blur` | `.bidRuleBackdrop` |
| `app/_analysis/keyword-bid-rule-panel.css:1` | `oversized-card-radius` | `.bidRulePanel` |
| `app/_analysis/keyword-bid-rule-panel.css:1` | `radial-glow` | `.bidRulePanel` |
| `app/_analysis/keyword-bid-rule-panel.css:4` | `oversized-card-radius` | `.bidRulePanel` |
| `app/_analysis/keyword-bid-rule-panel.css:12` | `glass-blur` | `.bidRulePortalLayer .bidRulePanel>header` |
| `app/_analysis/keyword-bid-schedule-panel.css:1` | `border-and-shadow` | `.bidScheduleCard` |
| `app/_analysis/keyword-bid-schedule-panel.css:1` | `decorative-gradient` | `.bidScheduleCard` |
| `app/_analysis/keyword-bid-schedule-panel.css:1` | `radial-glow` | `.bidScheduleCard` |
| `app/_analysis/keyword-bid-schedule-panel.css:6` | `decorative-gradient` | `.bidScheduleCard.emergency` |
| `app/_analysis/keyword-bid-schedule-panel.css:6` | `radial-glow` | `.bidScheduleCard.emergency` |
| `app/_analysis/keyword-bid-schedule-panel.css:11` | `decorative-gradient` | `/* Phase 25-5: a repeated Naver keyword change rests before another write. */ .bidScheduleCooldown` |
| `app/_analysis/keyword-detail-workbench.css:1` | `decorative-gradient` | `.keywordDetailDecision` |
| `app/_analysis/keyword-detail-workbench.css:4` | `decorative-gradient` | `.keywordDetailReasons` |
| `app/_analysis/keyword-detail-workbench.css:5` | `decorative-gradient` | `.keywordDetailAi` |
| `app/_analysis/keyword-performance-workbench.module.css:2` | `border-and-shadow` | `.hero` |
| `app/_analysis/keyword-performance-workbench.module.css:2` | `decorative-gradient` | `.hero` |
| `app/_analysis/keyword-performance-workbench.module.css:3` | `decorative-gradient` | `.hero::after` |
| `app/_analysis/keyword-performance-workbench.module.css:3` | `radial-glow` | `.hero::after` |
| `app/_analysis/keyword-performance-workbench.module.css:5` | `border-and-shadow` | `.hero aside` |
| `app/_analysis/keyword-performance-workbench.module.css:5` | `glass-blur` | `.hero aside` |
| `app/_analysis/keyword-performance-workbench.module.css:6` | `border-and-shadow` | `.controls` |
| `app/_analysis/keyword-performance-workbench.module.css:8` | `decorative-gradient` | `.skeleton span` |
| `app/_analysis/keyword-performance-workbench.module.css:10` | `border-and-shadow` | `.primaryPanel,.splitPanel>div,.heatPanel,.financePanel` |
| `app/_analysis/keyword-performance-workbench.module.css:10` | `oversized-card-radius` | `.primaryPanel,.splitPanel>div,.heatPanel,.financePanel` |
| `app/_analysis/keyword-performance-workbench.module.css:12` | `decorative-gradient` | `.chartWrap` |
| `app/_design-system/harin-bulk-selection.css:1` | `border-and-shadow` | `.v8BulkSelectionBar` |
| `app/_design-system/harin-bulk-selection.css:1` | `decorative-gradient` | `.v8BulkSelectionBar` |
| `app/_design-system/harin-bulk-selection.css:4` | `glass-blur` | `.v8BulkSelectionBar.active` |
| `app/_design-system/harin-v8.css:133` | `border-and-shadow` | `.v8Card` |
| `app/_main/harin-main-v8.css:3` | `border-and-shadow` | `.harinV8 .mainDailyHero` |
| `app/_main/harin-main-v8.css:3` | `decorative-gradient` | `.harinV8 .mainDailyHero` |
| `app/_main/harin-main-v8.css:3` | `radial-glow` | `.harinV8 .mainDailyHero` |
| `app/_main/harin-main-v8.css:5` | `border-and-shadow` | `.harinV8 .mainPhasePill` |
| `app/_main/harin-main-v8.css:9` | `border-and-shadow` | `.harinV8 .mainCutoffClock,.harinV8 .mainGoalPulse` |
| `app/_main/harin-main-v8.css:9` | `glass-blur` | `.harinV8 .mainCutoffClock,.harinV8 .mainGoalPulse` |
| `app/_main/harin-main-v8.css:12` | `decorative-gradient` | `.harinV8 .mainHeroOrb.one` |
| `app/_main/harin-main-v8.css:12` | `decorative-gradient` | `.harinV8 .mainHeroOrb.two` |
| `app/_main/harin-main-v8.css:13` | `border-and-shadow` | `.harinV8 .mainQuickSearch` |
| `app/_main/harin-main-v8.css:16` | `border-and-shadow` | `.harinV8 .mainQuickResults` |
| `app/_main/harin-main-v8.css:16` | `glass-blur` | `.harinV8 .mainQuickResults` |
| `app/_main/harin-main-v8.css:17` | `border-and-shadow` | `.harinV8 .mainTaskGroups>button` |
| `app/_main/harin-main-v8.css:17` | `decorative-gradient` | `.harinV8 .mainTaskGroups>button.active` |
| `app/_main/harin-main-v8.css:18` | `border-and-shadow` | `.harinV8 .mainScheduleCard,.harinV8 .mainExceptionInbox,.harinV8 .mainActionSection,.harinV8 .mainPacing,.harinV8 .mainChannelHealth,.harinV8 .mainProductSignals,.harinV8 .mainCashflow` |
| `app/_operations/harin-operations-v8.css:3` | `border-and-shadow` | `/* Route-scoped legacy styles moved from globals.css in Phase 23 hardening. */ /* Phase 11-3: packing and shipping workbench */ .shippingWorkbench` |
| `app/_operations/harin-operations-v8.css:7` | `thick-side-accent` | `.postalTestWorkbench` |
| `app/_operations/harin-operations-v8.css:8` | `thick-side-accent` | `.shippingCandidates` |
| `app/_operations/harin-operations-v8.css:12` | `border-and-shadow` | `.postalConnection` |
| `app/_operations/harin-operations-v8.css:13` | `decorative-gradient` | `.orderProductImage` |
| `app/_operations/harin-operations-v8.css:79` | `oversized-card-radius` | `.shippingQaPanel summary em` |
| `app/_operations/harin-operations-v8.css:79` | `thick-side-accent` | `.shippingQaPanel` |
| `app/_operations/harin-operations-v8.css:85` | `decorative-gradient` | `/* Phase 11-3A — bulk selection and always-visible postal tracking entry. */ .bulkShippingSelection` |
| `app/_operations/harin-operations-v8.css:95` | `decorative-gradient` | `.shippingWorkbenchFocused>header` |
| `app/_operations/harin-operations-v8.css:107` | `thick-side-accent` | `.shippingWorkbenchFocused .shippingMessage` |
| `app/_operations/harin-operations-v8.css:111` | `border-and-shadow` | `.unifiedCsWorkCard` |
| `app/_operations/harin-operations-v8.css:111` | `decorative-gradient` | `.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:111` | `radial-glow` | `.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:111` | `thick-side-accent` | `.unifiedCsWorkCard` |
| `app/_operations/harin-operations-v8.css:119` | `border-and-shadow` | `.productOpsRow` |
| `app/_operations/harin-operations-v8.css:119` | `decorative-eyebrow` | `.productOpsHero .eyebrow` |
| `app/_operations/harin-operations-v8.css:119` | `decorative-gradient` | `.productOpsHero` |
| `app/_operations/harin-operations-v8.css:119` | `radial-glow` | `.productOpsHero` |
| `app/_operations/harin-operations-v8.css:119` | `thick-side-accent` | `.productOpsRow` |
| `app/_operations/harin-operations-v8.css:125` | `border-and-shadow` | `.inventoryOpsRow` |
| `app/_operations/harin-operations-v8.css:125` | `decorative-gradient` | `.inventoryOpsHero` |
| `app/_operations/harin-operations-v8.css:125` | `radial-glow` | `.inventoryOpsHero` |
| `app/_operations/harin-operations-v8.css:125` | `thick-side-accent` | `.inventoryOpsRow` |
| `app/_operations/harin-operations-v8.css:130` | `border-and-shadow` | `.settlementOpsChannel` |
| `app/_operations/harin-operations-v8.css:130` | `decorative-gradient` | `.settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:130` | `radial-glow` | `.settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:135` | `decorative-gradient` | `.phase13WorkspaceNav button` |
| `app/_operations/harin-operations-v8.css:135` | `decorative-gradient` | `.phase13WorkspaceNav button.active` |
| `app/_operations/harin-operations-v8.css:135` | `oversized-card-radius` | `.phase13WorkspaceNav b` |
| `app/_operations/harin-operations-v8.css:136` | `border-and-shadow` | `.inventoryReplenishmentCard` |
| `app/_operations/harin-operations-v8.css:136` | `oversized-card-radius` | `.inventoryReplenishmentCard header em` |
| `app/_operations/harin-operations-v8.css:144` | `border-and-shadow` | `.collectionOpsChannel` |
| `app/_operations/harin-operations-v8.css:144` | `decorative-gradient` | `.collectionOpsHero` |
| `app/_operations/harin-operations-v8.css:144` | `radial-glow` | `.collectionOpsHero` |
| `app/_operations/harin-operations-v8.css:148` | `border-and-shadow` | `.reliabilityWorkbench` |
| `app/_operations/harin-operations-v8.css:148` | `decorative-gradient` | `.reliabilityWorkbench` |
| `app/_operations/harin-operations-v8.css:148` | `thick-side-accent` | `.workerHeartbeatGrid article` |
| `app/_operations/harin-operations-v8.css:152` | `border-and-shadow` | `.inventoryLotSummaryHeader,.inventoryLotForm,.inventoryLotList,.inventoryLotUnregistered` |
| `app/_operations/harin-operations-v8.css:152` | `decorative-gradient` | `.inventoryLotSummaryHeader` |
| `app/_operations/harin-operations-v8.css:152` | `decorative-gradient` | `.inventoryLotKpis>span,.inventoryLotKpis>button` |
| `app/_operations/harin-operations-v8.css:152` | `decorative-gradient` | `.inventoryLotForm>button` |
| `app/_operations/harin-operations-v8.css:152` | `decorative-gradient` | `.inventoryLotList>article.priority4,.inventoryLotList>article.priority3` |
| `app/_operations/harin-operations-v8.css:180` | `border-and-shadow` | `.orderHistoryBoundary article` |
| `app/_operations/harin-operations-v8.css:182` | `decorative-gradient` | `.orderHistoryBoundary .rocketGrowthReadOnly` |
| `app/_operations/harin-operations-v8.css:183` | `border-and-shadow` | `.orderWorkspacePanel` |
| `app/_operations/harin-operations-v8.css:183` | `decorative-gradient` | `.orderWorkspacePanel` |
| `app/_operations/harin-operations-v8.css:190` | `thick-side-accent` | `.orderWorkspaceHeading` |
| `app/_operations/harin-operations-v8.css:207` | `border-and-shadow` | `.unifiedOrdersHero,.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:211` | `decorative-gradient` | `.unifiedOrdersHero,.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:211` | `radial-glow` | `.unifiedOrdersHero,.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:218` | `decorative-gradient` | `.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:218` | `radial-glow` | `.unifiedCsHero` |
| `app/_operations/harin-operations-v8.css:230` | `border-and-shadow` | `.unifiedOrdersHero .ordersHeroMetrics>span` |
| `app/_operations/harin-operations-v8.css:233` | `border-and-shadow` | `.unifiedCsHero aside` |
| `app/_operations/harin-operations-v8.css:238` | `border-and-shadow` | `.orderFocusRail>button,.csFocusRail>button,.orderScanCommand` |
| `app/_operations/harin-operations-v8.css:240` | `decorative-gradient` | `.orderFocusRail>button.danger,.csFocusRail>button.danger` |
| `app/_operations/harin-operations-v8.css:244` | `border-and-shadow` | `.shippingCompletionNotice` |
| `app/_operations/harin-operations-v8.css:244` | `decorative-gradient` | `.shippingCompletionNotice` |
| `app/_operations/harin-operations-v8.css:245` | `decorative-gradient` | `.shippingCompletionNotice.loading` |
| `app/_operations/harin-operations-v8.css:245` | `decorative-gradient` | `.shippingCompletionNotice.partial` |
| `app/_operations/harin-operations-v8.css:254` | `decorative-gradient` | `.orderHistoryBoundary .rocketGrowthReadOnly` |
| `app/_operations/harin-operations-v8.css:264` | `decorative-gradient` | `.orderWorkspaceNav button.active` |
| `app/_operations/harin-operations-v8.css:266` | `border-and-shadow` | `.orderWorkspaceHeading` |
| `app/_operations/harin-operations-v8.css:266` | `decorative-gradient` | `.orderWorkspaceHeading` |
| `app/_operations/harin-operations-v8.css:268` | `border-and-shadow` | `.orderWorkspaceHeadingIcon` |
| `app/_operations/harin-operations-v8.css:271` | `decorative-gradient` | `.shippingWorkbenchFocused>header` |
| `app/_operations/harin-operations-v8.css:277` | `border-and-shadow` | `.csQuickMacros` |
| `app/_operations/harin-operations-v8.css:279` | `decorative-gradient` | `.phase13WorkspaceNav.customer button.active` |
| `app/_operations/harin-operations-v8.css:316` | `border-and-shadow` | `.inventoryOpsV8 .inventoryOpsHero,.settlementOpsV8 .settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:319` | `decorative-gradient` | `.inventoryOpsV8 .inventoryOpsHero,.settlementOpsV8 .settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:319` | `radial-glow` | `.inventoryOpsV8 .inventoryOpsHero,.settlementOpsV8 .settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:323` | `decorative-gradient` | `.settlementOpsV8 .settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:323` | `radial-glow` | `.settlementOpsV8 .settlementOpsHero` |
| `app/_operations/harin-operations-v8.css:331` | `border-and-shadow` | `.inventoryHeroMetrics>span,.settlementHeroMetrics>span` |
| `app/_operations/harin-operations-v8.css:337` | `border-and-shadow` | `.inventoryFocusRail>button,.settlementFocusRail>button` |
| `app/_operations/harin-operations-v8.css:339` | `decorative-gradient` | `.inventoryFocusRail>button.danger,.settlementFocusRail>button.danger` |
| `app/_operations/harin-operations-v8.css:340` | `decorative-gradient` | `.inventoryFocusRail>button.notice,.settlementFocusRail>button.notice` |
| `app/_operations/harin-operations-v8.css:348` | `decorative-gradient` | `.inventoryOpsV8 .phase13WorkspaceNav.inventory button.active` |
| `app/_operations/harin-operations-v8.css:349` | `decorative-gradient` | `.settlementOpsV8 .phase13WorkspaceNav.settlement button.active` |
| `app/_operations/harin-operations-v8.css:354` | `border-and-shadow` | `.inventoryOpsV8 .inventoryOpsToolbar` |
| `app/_operations/harin-operations-v8.css:361` | `border-and-shadow` | `.inventoryUnavailableGroup` |
| `app/_operations/harin-operations-v8.css:363` | `border-and-shadow` | `.inventoryPlannerControls` |
| `app/_operations/harin-operations-v8.css:363` | `decorative-gradient` | `.inventoryPlannerControls` |
| `app/_operations/harin-operations-v8.css:368` | `decorative-gradient` | `/* Phase 16-4: inventory is a Coupang Rocket Growth-only workbench. */ .inventoryRocketGrowthOnly .inventoryOpsHero` |
| `app/_operations/harin-operations-v8.css:368` | `radial-glow` | `/* Phase 16-4: inventory is a Coupang Rocket Growth-only workbench. */ .inventoryRocketGrowthOnly .inventoryOpsHero` |
| `app/_operations/harin-operations-v8.css:370` | `border-and-shadow` | `.inventoryRgSyncButton` |
| `app/_operations/harin-operations-v8.css:370` | `decorative-gradient` | `.inventoryRgSyncButton` |
| `app/_operations/harin-operations-v8.css:372` | `decorative-gradient` | `.inventoryRocketGrowthOnly .inventoryFocusRail>button.notice` |
| `app/_operations/harin-operations-v8.css:373` | `decorative-gradient` | `.inventoryRocketGrowthOnly .phase13WorkspaceNav.inventory button.active` |
| `app/_operations/harin-operations-v8.css:378` | `decorative-gradient` | `.rgInventoryMetrics>span.primary` |
| `app/_operations/harin-operations-v8.css:379` | `decorative-gradient` | `.inventoryRocketGrowthOnly .inventoryPlannerControls` |
| `app/_operations/harin-operations-v8.css:380` | `decorative-gradient` | `.rgZeroStockGroup>summary` |
| `app/_operations/harin-operations-v8.css:383` | `border-and-shadow` | `.settlementReconciliationWorkbench>header` |
| `app/_operations/harin-operations-v8.css:383` | `decorative-gradient` | `.settlementReconciliationWorkbench>header` |
| `app/_operations/harin-operations-v8.css:410` | `decorative-gradient` | `/* Phase 16-7: truthful collection freshness and platform card system. */ .collectionOpsChannel` |
| `app/_operations/harin-operations-v8.css:410` | `decorative-gradient` | `.collectionOpsChannel.naver` |
| `app/_operations/harin-operations-v8.css:410` | `decorative-gradient` | `.collectionOpsChannel.cafe24` |
| `app/_operations/harin-operations-v8.css:410` | `decorative-gradient` | `.collectionOpsChannel.coupang` |
| `app/_operations/harin-operations-v8.css:423` | `border-and-shadow` | `/* Phase 16-5: semantic pictograms for product and collection workspaces. */ .productWorkspaceIntro` |
| `app/_operations/harin-operations-v8.css:423` | `decorative-gradient` | `/* Phase 16-5: semantic pictograms for product and collection workspaces. */ .productWorkspaceIntro` |
| `app/_operations/harin-operations-v8.css:423` | `radial-glow` | `/* Phase 16-5: semantic pictograms for product and collection workspaces. */ .productWorkspaceIntro` |
| `app/_operations/harin-operations-v8.css:424` | `border-and-shadow` | `.productWorkspaceTitle>i,.mappingPanelTitle>i,.mappingWorkbenchTitle>i` |
| `app/_operations/harin-operations-v8.css:425` | `border-and-shadow` | `.productWorkspaceIntro>button` |
| `app/_operations/harin-operations-v8.css:428` | `border-and-shadow` | `.productOpsHero` |
| `app/_operations/harin-operations-v8.css:428` | `decorative-gradient` | `.productOpsHero` |
| `app/_operations/harin-operations-v8.css:428` | `radial-glow` | `.productOpsHero` |
| `app/_operations/harin-operations-v8.css:432` | `border-and-shadow` | `.productOpsToolbar` |
| `app/_operations/harin-operations-v8.css:444` | `decorative-gradient` | `.growthCenterHead` |
| `app/_operations/harin-operations-v8.css:444` | `radial-glow` | `.growthCenterHead` |
| `app/_operations/harin-operations-v8.css:447` | `border-and-shadow` | `.collectionOpsHero` |
| `app/_operations/harin-operations-v8.css:447` | `decorative-gradient` | `.collectionOpsHero` |
| `app/_operations/harin-operations-v8.css:447` | `radial-glow` | `.collectionOpsHero` |
| `app/_operations/harin-operations-v8.css:449` | `decorative-gradient` | `.reliabilityWorkbench` |
| `app/_operations/harin-operations-v8.css:461` | `decorative-gradient` | `.settlementMoneyJourney article.plus` |
| `app/_operations/harin-operations-v8.css:461` | `decorative-gradient` | `.settlementMoneyJourney article.minus` |
| `app/_operations/harin-operations-v8.css:461` | `decorative-gradient` | `.settlementMoneyJourney article.result` |
| `app/_operations/harin-operations-v8.css:465` | `border-and-shadow` | `.settlementMoneyJourney article,.marketingFunnelStage>section,.growthSteps>span,.collectionOpsFlow article` |
| `app/_operations/harin-operations-v8.css:466` | `decorative-gradient` | `.marketingFunnelStage:nth-child(1)>section` |
| `app/_operations/harin-operations-v8.css:466` | `decorative-gradient` | `.marketingFunnelStage:nth-child(2)>section` |
| `app/_operations/harin-operations-v8.css:466` | `decorative-gradient` | `.marketingFunnelStage:nth-child(3)>section` |
| `app/_operations/harin-operations-v8.css:466` | `decorative-gradient` | `.marketingFunnelStage:nth-child(4)>section` |
| `app/_operations/harin-operations-v8.css:472` | `decorative-gradient` | `.inventoryRocketGrowthOnly .rgInventoryRow.selected,.inventoryRocketGrowthOnly .inventoryReplenishmentCard.selected` |
| `app/_reliability/harin-live-status-dock.css:2` | `glass-blur` | `.liveStatusToggle` |
| `app/_reliability/harin-live-status-dock.css:2` | `glass-blur` | `.liveStatusBody` |
| `app/_reliability/harin-naver-api-center.css:2` | `border-and-shadow` | `.naverApiHero` |
| `app/_reliability/harin-naver-api-center.css:2` | `decorative-gradient` | `.naverApiHero` |
| `app/_reliability/harin-naver-api-center.css:8` | `border-and-shadow` | `.naverApiServiceCard` |
| `app/_reliability/harin-naver-api-center.css:8` | `oversized-card-radius` | `.naverApiServiceCard` |
| `app/_reliability/harin-naver-api-center.css:13` | `border-and-shadow` | `.shippingCalendarCard,.shippingAddressWorkbench` |
| `app/_reliability/harin-naver-api-center.css:13` | `oversized-card-radius` | `.shippingCalendarCard,.shippingAddressWorkbench` |
| `app/_reliability/harin-naver-api-center.css:29` | `decorative-gradient` | `.advertisingChannelHero` |
| `app/_reliability/harin-naver-api-center.css:31` | `border-and-shadow` | `.advertisingChannelCard` |
| `app/_reliability/harin-naver-api-center.css:31` | `oversized-card-radius` | `.advertisingChannelCard` |
| `app/_reliability/harin-naver-api-center.css:43` | `decorative-gradient` | `.providerFallbackHero` |
| `app/_reliability/harin-naver-api-center.css:46` | `border-and-shadow` | `.providerFallbackCard` |
| `app/_reliability/harin-naver-api-center.css:46` | `oversized-card-radius` | `.providerFallbackCard` |
| `app/_reliability/harin-naver-api-center.css:56` | `decorative-gradient` | `.optionalProviderHero` |
| `app/_reliability/harin-naver-api-center.css:58` | `border-and-shadow` | `.optionalProviderCard` |
| `app/_reliability/harin-naver-api-center.css:58` | `oversized-card-radius` | `.optionalProviderCard` |
| `app/_reliability/harin-naver-api-center.css:64` | `border-and-shadow` | `.providerRuntimeHero` |
| `app/_reliability/harin-naver-api-center.css:64` | `decorative-gradient` | `.providerRuntimeHero` |
| `app/_reliability/harin-naver-api-center.css:65` | `border-and-shadow` | `.providerRuntimeKpis article` |
| `app/_reliability/harin-naver-api-center.css:66` | `border-and-shadow` | `.providerRuntimeGroup` |
| `app/_reliability/harin-naver-api-center.css:71` | `border-and-shadow` | `/* Phase 23-4C · high-density provider workbench */ .providerRuntimeToolbar` |
| `app/_reliability/harin-naver-api-center.css:72` | `border-and-shadow` | `.providerRuntimeList,.providerRuntimeDetail` |
| `app/_reliability/harin-naver-api-center.css:72` | `thick-side-accent` | `.providerRuntimeCompactRow.selected` |
| `app/_reliability/harin-naver-api-center.css:77` | `border-and-shadow` | `.executionPathHero` |
| `app/_reliability/harin-naver-api-center.css:77` | `decorative-gradient` | `.executionPathHero` |
| `app/_reliability/harin-naver-api-center.css:80` | `decorative-gradient` | `.executionDryRun` |
| `app/_reliability/harin-naver-api-center.css:81` | `decorative-gradient` | `.executionRecovery` |
| `app/_reliability/harin-naver-api-center.css:82` | `border-and-shadow` | `.executionPathKpis article` |
| `app/_reliability/harin-naver-api-center.css:84` | `border-and-shadow` | `.executionLane` |
| `app/_reliability/harin-naver-api-center.css:90` | `border-and-shadow` | `.executionHandover` |
| `app/_reliability/harin-naver-api-center.css:90` | `decorative-gradient` | `.executionHandover` |
| `app/_reliability/harin-naver-api-center.css:91` | `border-and-shadow` | `.executionCredentials` |
| `app/_reliability/harin-naver-api-center.css:91` | `decorative-gradient` | `.executionCredentials` |
| `app/_reliability/harin-reliability-v8.css:2` | `border-and-shadow` | `.reliabilityHero` |
| `app/_reliability/harin-reliability-v8.css:2` | `decorative-gradient` | `.reliabilityHero` |
| `app/_reliability/harin-reliability-v8.css:5` | `glass-blur` | `.reliabilityHero>aside` |
| `app/_reliability/harin-reliability-v8.css:6` | `border-and-shadow` | `.reliabilityChannelRail article` |
| `app/_reliability/harin-reliability-v8.css:9` | `border-and-shadow` | `.reliabilityWorkerSignals,.reliabilityExceptionPreview` |
| `app/_reliability/harin-reliability-v8.css:18` | `border-and-shadow` | `.notificationAlertDetail` |
| `app/_shell/harin-entry-v8.css:19` | `border-and-shadow` | `.harinV8 .loginCard` |
| `app/_workspace/harin-owner-workspace.css:3` | `border-and-shadow` | `.ownerWorkspaceTrigger` |
| `app/_workspace/harin-owner-workspace.css:3` | `border-and-shadow` | `.ownerWorkspacePanel` |
| `app/_workspace/harin-owner-workspace.css:3` | `border-and-shadow` | `.ownerWorkspaceSearch` |
| `app/_workspace/harin-owner-workspace.css:3` | `decorative-gradient` | `.ownerWorkspaceTrigger` |
| `app/_workspace/harin-owner-workspace.css:3` | `decorative-gradient` | `.ownerWorkspacePanel>header` |
| `app/_workspace/harin-owner-workspace.css:3` | `decorative-gradient` | `.ownerCaptureForm,.ownerAutosaveEditor` |
| `app/_workspace/harin-owner-workspace.css:3` | `glass-blur` | `.ownerWorkspaceBackdrop` |
| `app/_workspace/harin-owner-workspace.css:3` | `oversized-card-radius` | `.ownerWorkspacePanel` |
| `app/_workspace/harin-owner-workspace.css:3` | `thick-side-accent` | `.ownerWorkList>article.high` |
| `app/_workspace/harin-owner-workspace.css:5` | `oversized-card-radius` | `.ownerWorkspacePanel` |
| `app/globals.css:2` | `border-and-shadow` | `.kpi` |
| `app/globals.css:2` | `border-and-shadow` | `.panel` |
| `app/globals.css:2` | `decorative-eyebrow` | `.eyebrow,.sectionTag` |
| `app/globals.css:2` | `decorative-gradient` | `.hero` |
| `app/globals.css:2` | `decorative-gradient` | `.sourceRow u` |
| `app/globals.css:2` | `glass-blur` | `.heroStatus` |
| `app/globals.css:2` | `oversized-card-radius` | `.productCard span` |
| `app/globals.css:5` | `decorative-gradient` | `.loginPage` |
| `app/globals.css:5` | `oversized-card-radius` | `.loginCard` |
| `app/globals.css:5` | `radial-glow` | `.loginPage` |
| `app/globals.css:14` | `decorative-gradient` | `.generatorPanel` |
| `app/globals.css:14` | `decorative-gradient` | `.generatorPanel form>button` |
| `app/globals.css:23` | `decorative-gradient` | `.searchTermHero` |
| `app/globals.css:25` | `border-and-shadow` | `.automationCard` |
| `app/globals.css:25` | `oversized-card-radius` | `.automationCard>em` |
| `app/globals.css:27` | `decorative-gradient` | `.insightHero` |
| `app/globals.css:30` | `border-and-shadow` | `.executivePanel` |
| `app/globals.css:36` | `decorative-gradient` | `.profitabilitySummary>div` |
| `app/globals.css:39` | `decorative-gradient` | `.coupangHero` |
| `app/globals.css:39` | `decorative-gradient` | `.coupangBar.sales` |
| `app/globals.css:39` | `decorative-gradient` | `.coupangBar.orders` |
| `app/globals.css:39` | `decorative-gradient` | `.coupangBar.revenue` |
| `app/globals.css:39` | `decorative-gradient` | `.stockFill` |
| `app/globals.css:39` | `decorative-gradient` | `.salesFill` |
| `app/globals.css:39` | `radial-glow` | `.coupangHero` |
| `app/globals.css:40` | `border-and-shadow` | `.inventoryCard` |
| `app/globals.css:40` | `decorative-gradient` | `.inventoryMarketingPanel` |
| `app/globals.css:40` | `decorative-gradient` | `.inventoryRunway i` |
| `app/globals.css:40` | `decorative-gradient` | `.inventoryCard.danger .inventoryRunway i` |
| `app/globals.css:40` | `decorative-gradient` | `.inventoryCard.warning .inventoryRunway i` |
| `app/globals.css:42` | `decorative-gradient` | `.realtimePanel` |
| `app/globals.css:42` | `decorative-gradient` | `.hourCol i` |
| `app/globals.css:58` | `decorative-gradient` | `.coupangImportPanel` |
| `app/globals.css:59` | `decorative-gradient` | `.coupangCostImporter` |
| `app/globals.css:59` | `decorative-gradient` | `.costWaterfall` |
| `app/globals.css:59` | `decorative-gradient` | `.costBreakdown em` |
| `app/globals.css:63` | `border-and-shadow` | `.coupangSectionTabs` |
| `app/globals.css:63` | `decorative-gradient` | `.coupangSectionTabs button.active` |
| `app/globals.css:63` | `glass-blur` | `.coupangSectionTabs` |
| `app/globals.css:65` | `decorative-gradient` | `.actualRevenuePanel` |
| `app/globals.css:70` | `border-and-shadow` | `.sellerOrderCard` |
| `app/globals.css:70` | `thick-side-accent` | `.sellerOrderCard` |
| `app/globals.css:77` | `decorative-gradient` | `.bidGuidePanel` |
| `app/globals.css:80` | `border-and-shadow` | `.anomalyBanner` |
| `app/globals.css:80` | `decorative-gradient` | `.anomalyBanner` |
| `app/globals.css:80` | `thick-side-accent` | `.anomalyBannerGrid article` |
| `app/globals.css:85` | `border-and-shadow` | `.pacingPanel` |
| `app/globals.css:85` | `decorative-gradient` | `.pacingPanel` |
| `app/globals.css:85` | `decorative-gradient` | `.pacingPanel.at_risk` |
| `app/globals.css:85` | `decorative-gradient` | `.pacingPanel.watch` |
| `app/globals.css:85` | `decorative-gradient` | `.pacingBars u` |
| `app/globals.css:85` | `decorative-gradient` | `.pacingBars>div:nth-child(2) u` |
| `app/globals.css:85` | `oversized-card-radius` | `.pacingPanel` |
| `app/globals.css:90` | `decorative-gradient` | `/* Cafe24 commerce analytics */ .cafeCommandHero` |
| `app/globals.css:90` | `decorative-gradient` | `.acquisitionList>div>i u` |
| `app/globals.css:96` | `decorative-gradient` | `.channelUnavailable` |
| `app/globals.css:96` | `oversized-card-radius` | `.channelOpsCard header b` |
| `app/globals.css:104` | `border-and-shadow` | `.notificationKpis article` |
| `app/globals.css:104` | `thick-side-accent` | `.alertCenterList>article` |
| `app/globals.css:109` | `decorative-gradient` | `.experimentCreate` |
| `app/globals.css:119` | `oversized-card-radius` | `.financialChangeCard header>em` |
| `app/globals.css:119` | `thick-side-accent` | `.financialChangeCard` |
| `app/globals.css:123` | `decorative-gradient` | `/* Actual settlement based channel cost calibration */ .calibrationCard` |
| `app/globals.css:123` | `decorative-gradient` | `.calibrationCard.medium` |
| `app/globals.css:123` | `decorative-gradient` | `.calibrationCard.low` |
| `app/globals.css:123` | `oversized-card-radius` | `.calibrationCard header em` |
| `app/globals.css:124` | `decorative-gradient` | `.shippingRulePanel` |
| `app/globals.css:124` | `oversized-card-radius` | `.shippingRulePanel>header em` |
| `app/globals.css:125` | `border-and-shadow` | `.financialTrustBanner` |
| `app/globals.css:125` | `thick-side-accent` | `.financialTrustBanner` |
| `app/globals.css:128` | `decorative-gradient` | `.financialReadinessProgress>div span` |
| `app/globals.css:128` | `decorative-gradient` | `.financialReadinessCenter.ready .financialReadinessProgress>div span` |
| `app/globals.css:134` | `border-and-shadow` | `.headerMore[open]>button` |
| `app/globals.css:135` | `border-and-shadow` | `.mobileBottomNav` |
| `app/globals.css:135` | `glass-blur` | `.mobileBottomNav` |
| `app/globals.css:136` | `border-and-shadow` | `.dataStateBar` |
| `app/globals.css:144` | `border-and-shadow` | `.metricProvenance` |
| `app/globals.css:145` | `border-and-shadow` | `.priorityCenter` |
| `app/globals.css:145` | `decorative-gradient` | `.priorityCenter` |
| `app/globals.css:145` | `decorative-gradient` | `.priorityCenter.attention` |
| `app/globals.css:146` | `border-and-shadow` | `.commandMetricGrid article` |
| `app/globals.css:146` | `border-and-shadow` | `.commandActionSection,.commandCard` |
| `app/globals.css:146` | `decorative-gradient` | `.commandHero` |
| `app/globals.css:146` | `radial-glow` | `.commandHero` |
| `app/globals.css:153` | `decorative-gradient` | `.growthCenterHead` |
| `app/globals.css:160` | `decorative-gradient` | `.costGuideBlock` |
| `app/globals.css:169` | `decorative-gradient` | `.phase7Hero` |
| `app/globals.css:169` | `radial-glow` | `.phase7Hero` |
| `app/globals.css:172` | `border-and-shadow` | `.phase8Automation` |
| `app/globals.css:173` | `border-and-shadow` | `.phase7Kpis article` |
| `app/globals.css:173` | `border-and-shadow` | `.phase7Panel` |
| `app/globals.css:179` | `border-and-shadow` | `.repurchaseMessaging` |
| `app/globals.css:179` | `decorative-gradient` | `.repurchaseMessaging` |
| `app/globals.css:286` | `decorative-gradient` | `.naverExecutiveHero` |
| `app/globals.css:286` | `radial-glow` | `.naverExecutiveHero` |
| `app/globals.css:288` | `border-and-shadow` | `.naverExecutiveKpi` |
| `app/globals.css:289` | `border-and-shadow` | `.naverExecutivePanel` |
| `app/globals.css:289` | `oversized-card-radius` | `.naverExecutivePanel header>em` |
| `app/globals.css:292` | `border-and-shadow` | `.naverBottleneckFlow>div.focus` |
| `app/globals.css:293` | `oversized-card-radius` | `.naverExecutivePanel.trust footer span` |
| `app/globals.css:301` | `border-and-shadow` | `.unifiedProcessPanel` |
| `app/globals.css:301` | `border-and-shadow` | `.unifiedOrderCard` |
| `app/globals.css:301` | `decorative-gradient` | `.unifiedOrdersHero` |
| `app/globals.css:301` | `oversized-card-radius` | `.channelBadge,.fulfillmentBadge,.unifiedOrderCard header strong` |
| `app/globals.css:301` | `radial-glow` | `.unifiedOrdersHero` |
| `app/globals.css:301` | `thick-side-accent` | `.unifiedCancelSummary` |
| `app/globals.css:301` | `thick-side-accent` | `.unifiedOrderCard` |
| `app/globals.css:323` | `thick-side-accent` | `.desktopSidebar nav .sidebarItem.active` |
| `app/globals.css:360` | `glass-blur` | `/* Phase 10-6: fast route feedback and five-slot mobile navigation */ .viewLoadingOverlay` |
| `app/globals.css:373` | `glass-blur` | `.mobileBottomNav>.mobileMoreMenu>.mobileMenuBackdrop` |
| `app/globals.css:375` | `border-and-shadow` | `.mobileBottomNav>.mobileMoreMenu>.mobileGroupedMenu` |
| `app/globals.css:377` | `glass-blur` | `.mobileMenuPanelHead` |
| `app/globals.css:413` | `border-and-shadow` | `.orderProcessNode>button.active` |
| `app/globals.css:493` | `decorative-gradient` | `.coupangOperationIntro` |
| `app/globals.css:512` | `decorative-gradient` | `/* Phase 22-5 · product-scoped experiment selector. */ .harinV8 .experimentProductScope` |
| `app/globals.css:528` | `decorative-gradient` | `.harinAiHero` |
| `app/globals.css:528` | `radial-glow` | `.harinAiHero` |
| `app/globals.css:528` | `thick-side-accent` | `.harinAiMessage` |
| `app/globals.css:528` | `thick-side-accent` | `.harinAiResult,.harinAiEmpty` |
| `app/globals.css:533` | `border-and-shadow` | `/* Phase 12-5A · warm, expandable AI analysis positions */ .aiPagePanel` |
| `app/globals.css:533` | `border-and-shadow` | `.viewLoadingRibbon` |
| `app/globals.css:533` | `decorative-gradient` | `.aiPagePanel>summary` |
| `app/globals.css:533` | `decorative-gradient` | `.aiPageAdvanced .harinAiHero` |
| `app/globals.css:533` | `decorative-gradient` | `.viewLoadingRibbon:after` |
| `app/globals.css:533` | `glass-blur` | `.viewLoadingRibbon` |
| `app/globals.css:533` | `radial-glow` | `.aiPagePanel>summary` |
| `app/globals.css:533` | `thick-side-accent` | `.aiPageGuard` |
| `app/globals.css:554` | `border-and-shadow` | `.knowledgeHero` |
| `app/globals.css:554` | `border-and-shadow` | `.knowledgeCreate` |
| `app/globals.css:554` | `decorative-gradient` | `.knowledgeHero` |
| `app/globals.css:554` | `radial-glow` | `.knowledgeHero` |
| `app/globals.css:554` | `thick-side-accent` | `.knowledgeMessage` |
| `app/globals.css:554` | `thick-side-accent` | `.knowledgeList>article` |
| `app/globals.css:563` | `border-and-shadow` | `.analysisContractSection` |
| `app/globals.css:563` | `decorative-gradient` | `/* Phase 12-5C · private source library and page analysis contracts */ .knowledgeHeroC` |
| `app/globals.css:563` | `decorative-gradient` | `.analysisContractSection>header` |
| `app/globals.css:563` | `radial-glow` | `/* Phase 12-5C · private source library and page analysis contracts */ .knowledgeHeroC` |
| `app/globals.css:563` | `radial-glow` | `.analysisContractSection>header` |
| `app/globals.css:569` | `border-and-shadow` | `/* Phase 12-5D · saved server previews before paid AI execution */ .aiResultPreview` |
| `app/globals.css:569` | `decorative-gradient` | `/* Phase 12-5D · saved server previews before paid AI execution */ .aiResultPreview` |
| `app/globals.css:569` | `decorative-gradient` | `.aiResultPreview.blocked` |
| `app/globals.css:569` | `thick-side-accent` | `/* Phase 12-5D · saved server previews before paid AI execution */ .aiResultPreview` |
| `app/globals.css:575` | `border-and-shadow` | `.naverBidHero` |
| `app/globals.css:575` | `border-and-shadow` | `.naverBidCandidate` |
| `app/globals.css:575` | `decorative-gradient` | `.naverBidHero` |
| `app/globals.css:575` | `radial-glow` | `.naverBidHero` |
| `app/globals.css:575` | `thick-side-accent` | `.naverBidBlockers` |
| `app/globals.css:575` | `thick-side-accent` | `.naverBidCandidate` |
| `app/globals.css:575` | `thick-side-accent` | `.financialBidLockNotice` |
| `app/globals.css:582` | `decorative-gradient` | `.naverBidProductLink` |
| `app/globals.css:587` | `border-and-shadow` | `.naverAutomationPanel` |
| `app/globals.css:587` | `decorative-gradient` | `.naverAutomationPanel` |
| `app/globals.css:587` | `decorative-gradient` | `.naverAutomationPanel:before` |
| `app/globals.css:587` | `radial-glow` | `.naverAutomationPanel` |
| `app/globals.css:594` | `border-and-shadow` | `.reportLearningCenter` |
| `app/globals.css:594` | `decorative-gradient` | `/* Phase 12-8: automatic reports and server-side learning history */ .phase12ReportIntro` |
| `app/globals.css:594` | `decorative-gradient` | `.reportScheduleGrid .automationCard:before` |
| `app/globals.css:594` | `decorative-gradient` | `.reportLearningCenter` |
| `app/globals.css:594` | `decorative-gradient` | `.reportLearningCenter:before` |
| `app/globals.css:594` | `radial-glow` | `/* Phase 12-8: automatic reports and server-side learning history */ .phase12ReportIntro` |
| `app/globals.css:594` | `thick-side-accent` | `.reportLearningTimeline article` |
| `app/globals.css:657` | `decorative-eyebrow` | `.eyebrow,.sectionTag` |
| `app/globals.css:730` | `border-and-shadow` | `.focusedWorkspaceNav>a` |
| `app/globals.css:730` | `decorative-gradient` | `.focusedWorkspaceNav>a` |
| `app/globals.css:730` | `decorative-gradient` | `.focusedWorkspaceNav>a.active` |
| `app/globals.css:730` | `radial-glow` | `.focusedWorkspaceNav>a.active` |
| `app/globals.css:737` | `border-and-shadow` | `/* Phase 15-1: keep the V8 design while collapsing repeated page chrome. */ .pageDataStatus` |
| `app/globals.css:756` | `decorative-gradient` | `.harinV8 .viewLoadingSkeleton i` |
| `app/globals.css:757` | `decorative-gradient` | `.harinV8 .viewLoadingRibbon:after` |

## 작동 방식

- 현재 부채는 기준 파일에 기록해 숨기지 않습니다.
- 기존 건수가 줄어드는 것은 허용하지만, 새 파일이나 기존 파일에 금지 패턴이 늘어나면 검사가 실패합니다.
- 탐지 결과는 디자인 개선 우선순위를 정하는 자료이며, 자동 수정은 하지 않습니다.

## 수동 검수 범위

- 카드 안의 카드처럼 DOM 구조를 확인해야 하는 중첩 카드
- 제목 위 둥근 아이콘 타일과 불필요한 pill chip
- 제목용·본문용 폰트 분리와 1.25배 이상 크기 단계
- 본문 명암 대비 4.5:1 이상과 실제 모바일 가독성
- 테두리와 그림자의 시각적 강도, 정보 밀도, 양옆 빈 공간 사용
