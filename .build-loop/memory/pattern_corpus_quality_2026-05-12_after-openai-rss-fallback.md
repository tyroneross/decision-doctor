# Corpus data-quality report — 2026-05-12

Generated: 2026-05-12T00:21:35.193Z (X-5 validate-corpus CLI)

**Total docs (global scope):** 1517
**Stub threshold:** body length < 200 chars

## Summary

| Source | Total | Full text | Summary | Blocked | Degraded | Metadata | Unknown | Stubs | Stub % | Challenge shell | Hash stale | Avg body |
|--------|-------|-----------|---------|---------|----------|----------|---------|-------|--------|-----------------|------------|----------|
| anthropic-docs | 64 | 0 | 0 | 0 | 0 | 0 | 64 | 1 | 1.6% | 0 | 38 | 12580 |
| anthropic-news | 13 | 0 | 0 | 0 | 0 | 0 | 13 | 0 | 0% | 0 | 13 | 7228 |
| arxiv | 58 | 0 | 0 | 0 | 0 | 0 | 58 | 0 | 0% | 0 | 0 | 1400 |
| chicago-booth-research | 71 | 0 | 0 | 0 | 0 | 0 | 71 | 27 | 38% ⚠️ | 0 | 20 | 939 |
| deepmind-blog | 150 | 0 | 0 | 0 | 0 | 0 | 150 | 0 | 0% | 0 | 1 | 7672 |
| huggingface-blog | 200 | 0 | 0 | 0 | 0 | 0 | 200 | 0 | 0% | 4 | 0 | 14176 |
| ibm-research | 250 | 0 | 0 | 0 | 0 | 0 | 250 | 0 | 0% | 0 | 75 | 1790 |
| mcp-spec | 190 | 0 | 0 | 0 | 0 | 0 | 190 | 0 | 0% | 3 | 0 | 10330 |
| mistral-blog | 50 | 0 | 0 | 0 | 0 | 0 | 50 | 0 | 0% | 2 | 0 | 6591 |
| mit-csail | 200 | 0 | 0 | 0 | 0 | 0 | 200 | 0 | 0% | 0 | 0 | 7412 |
| openai-news | 52 | 25 | 25 | 0 | 0 | 2 | 0 | 27 | 51.9% ⚠️ | 0 | 0 | 4490 |
| perplexity-research | 19 | 18 | 1 | 0 | 0 | 0 | 0 | 1 | 5.3% ⚠️ | 0 | 0 | 15096 |
| stanford-hai | 200 | 0 | 0 | 0 | 0 | 0 | 200 | 0 | 0% | 1 | 16 | 6867 |

## Enrichment Tieouts

| Source | No embedding | Stale embedding | No KG mentions | Stale summary hash | Stale KG hash |
|--------|--------------|-----------------|----------------|--------------------|---------------|
| anthropic-docs | 0 | 0 | 1 | 0 | 0 |
| anthropic-news | 0 | 0 | 0 | 0 | 0 |
| arxiv | 0 | 0 | 0 | 0 | 0 |
| chicago-booth-research | 0 | 0 | 3 | 0 | 0 |
| deepmind-blog | 0 | 0 | 0 | 0 | 0 |
| huggingface-blog | 0 | 0 | 0 | 0 | 0 |
| ibm-research | 0 | 0 | 0 | 0 | 0 |
| mcp-spec | 6 | 0 | 6 | 0 | 0 |
| mistral-blog | 0 | 0 | 0 | 0 | 0 |
| mit-csail | 0 | 0 | 0 | 0 | 0 |
| openai-news | 27 | 0 | 28 | 0 | 0 |
| perplexity-research | 1 | 0 | 1 | 0 | 0 |
| stanford-hai | 0 | 0 | 0 | 0 | 0 |

> **Known baseline:** openai-news 50-placeholder gap predates X-1..X-5; tracked separately (decision_pg_search_install.md / F-12 hard-stop).

## anthropic-docs — 5 random samples

- **Prompt engineering overview** (1615 chars, unknown, hash ok)
  - source_id: `docs/en/build-with-claude/prompt-engineering/overview`
  - url: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
  - body: Copy pageBefore prompt engineering This guide assumes that you have: A clear definition of the success criteria for your use case Some ways to empirically test against those criteria A first draft pro…
- **Web search tool** (10120 chars, unknown, hash ok)
  - source_id: `docs/en/agents-and-tools/tool-use/web-search-tool`
  - url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
  - body: Copy pageThe web search tool gives Claude direct access to real-time web content, allowing it to answer questions with up-to-date information beyond its knowledge cutoff. The response includes citatio…
- **Claude API skill** (8922 chars, unknown, hash ok)
  - source_id: `docs/en/agents-and-tools/agent-skills/claude-api-skill`
  - url: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/claude-api-skill
  - body: Copy pageThe claude-api skill is an open-source Agent Skill that provides Claude with detailed, up-to-date reference material for building applications on two Anthropic surfaces: Messages API — the pr…
- **Tool use with prompt caching** (3342 chars, unknown, hash ok)
  - source_id: `docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching`
  - url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching
  - body: Copy pageThis page covers prompt caching for tool definitions: where to place cache_control breakpoints, how defer_loading preserves your cache, and what invalidates it. For general prompt caching, se…
- **Citations** (11273 chars, unknown, hash stale)
  - source_id: `docs/en/build-with-claude/citations`
  - url: https://platform.claude.com/docs/en/build-with-claude/citations
  - body: Copy pageThis feature is eligible for Zero Data Retention (ZDR). When your organization has a ZDR arrangement, data sent through this feature is not stored after the API response is returned. Claude i…

## anthropic-news — 5 random samples

- **Agents for financial services** (12120 chars, unknown, hash stale)
  - source_id: `finance-agents`
  - url: https://www.anthropic.com/news/finance-agents
  - body: AnnouncementsAgents for financial servicesMay 5, 2026We’re releasing ten ready-to-run agent templates for the most time-consuming work in financial services: building pitchbooks, screening KYC files,…
- **Anthropic and NEC partner to build AI-native engineering at scale in Japan** (3108 chars, unknown, hash stale)
  - source_id: `anthropic-nec`
  - url: https://www.anthropic.com/news/anthropic-nec
  - body: AnnouncementsAnthropic and NEC collaborate to build Japan’s largest AI engineering workforceApr 24, 2026NEC Corporation will use Claude as it builds one of Japan’s largest AI-native engineering organi…
- **Higher usage limits for Claude and a compute deal with SpaceX** (3378 chars, unknown, hash stale)
  - source_id: `higher-limits-spacex`
  - url: https://www.anthropic.com/news/higher-limits-spacex
  - body: AnnouncementsHigher usage limits for Claude and a compute deal with SpaceXMay 6, 2026We’ve agreed to a partnership with SpaceX that will substantially increase our compute capacity. This, along with o…
- **The Long-Term Benefit Trust** (13993 chars, unknown, hash stale)
  - source_id: `the-long-term-benefit-trust`
  - url: https://www.anthropic.com/news/the-long-term-benefit-trust
  - body: AnnouncementsThe Long-Term Benefit TrustSep 19, 2023Today we are sharing more details about our new governance structure called the Long-Term Benefit Trust (LTBT), which we have been developing since…
- **Introducing the Model Context Protocol** (4859 chars, unknown, hash stale)
  - source_id: `model-context-protocol`
  - url: https://www.anthropic.com/news/model-context-protocol
  - body: AnnouncementsIntroducing the Model Context ProtocolNov 25, 2024Today, we're open-sourcing the Model Context Protocol (MCP), a new standard for connecting AI assistants to the systems where data lives,…

## arxiv — 5 random samples

- **Transformers Efficiently Perform In-Context Logistic Regression via Normalized Gradient Descent** (1128 chars, unknown, hash ok)
  - source_id: `2605.06609`
  - url: http://arxiv.org/abs/2605.06609v1
  - body: Transformers have demonstrated remarkable in-context learning (ICL) capabilities. The strong ICL performance of transformers is commonly believed to arise from their ability to implicitly execute cert…
- **ActCam: Zero-Shot Joint Camera and 3D Motion Control for Video Generation** (1504 chars, unknown, hash ok)
  - source_id: `2605.06667`
  - url: http://arxiv.org/abs/2605.06667v1
  - body: For artistic applications, video generation requires fine-grained control over both performance and cinematography, i.e., the actor's motion and the camera trajectory. We present ActCam, a zero-shot m…
- **The Limits of AI-Driven Allocation: Optimal Screening under Aleatoric Uncertainty** (1435 chars, unknown, hash ok)
  - source_id: `2605.07979`
  - url: http://arxiv.org/abs/2605.07979v1
  - body: The rise of machine learning has shifted targeted resource allocation in policy and humanitarian settings toward algorithmic targeting based on predicted risk scores. This approach is typically cheape…
- **Globally Optimal Training of Spiking Neural Networks via Parameter Reconstruction** (999 chars, unknown, hash ok)
  - source_id: `2605.08022`
  - url: http://arxiv.org/abs/2605.08022v1
  - body: Spiking Neural Networks (SNNs) have been proposed as biologically plausible and energy-efficient alternatives to conventional Artificial Neural Networks (ANNs). However, the training of SNN usually re…
- **It Just Takes Two: Scaling Amortized Inference to Large Sets** (1127 chars, unknown, hash ok)
  - source_id: `2605.07972`
  - url: http://arxiv.org/abs/2605.07972v1
  - body: Neural posterior estimation has emerged as a powerful tool for amortized inference, with growing adoption across scientific and applied domains. In many of these applications, the conditioning variabl…

## chicago-booth-research — 5 random samples

- **2017 - 18 Year in Review** (1570 chars, unknown, hash ok)
  - source_id: `documents/igm/year-in-review/2018/26`
  - url: https://research.chicagobooth.edu/documents/igm/year-in-review/2018/26/
  - body: 1 25 27 34 2017 - 18 Year in Review 24 THE ECONOMIC LIMITS OF BITCOIN AND THE BLOCKCHAIN The amount of computational power devoted to anonymous, decentralized blockchains such as Bitcoin’s must simult…
- **2015-16 IGM Year in Review** (590 chars, unknown, hash ok)
  - source_id: `documents/igm/year-in-review/2016/14`
  - url: https://research.chicagobooth.edu/documents/igm/year-in-review/2016/14/
  - body: 1 13 15 34 2015-16 IGM Year in Review 12 During the Myron Scholes Global Markets Forum, business leaders, policymakers, and distinguished scholars speak publicly on issues of current interest. These e…
- **2017 - 18 Year in Review** (103 chars, unknown, hash stale)
  - source_id: `documents/igm/year-in-review/2018/24`
  - url: https://research.chicagobooth.edu/documents/igm/year-in-review/2018/24/
  - body: 2017 - 18 Year in Review ABC 123DEF 4562017 - 18 Year in Review pages: / 34 Chicago Booth Click to Read…
- **2015-16 IGM Year in Review** (2021 chars, unknown, hash ok)
  - source_id: `documents/igm/year-in-review/2016/4`
  - url: https://research.chicagobooth.edu/documents/igm/year-in-review/2016/4/
  - body: 1 3 5 34 2015-16 IGM Year in Review Letter from the Director During 2015–16, the Initiative on Global Markets (IGM) continued to engage with the public on a wide range of policy issues, drawing on the…
- **2017 - 18 Year in Review** (580 chars, unknown, hash ok)
  - source_id: `documents/igm/year-in-review/2018/14`
  - url: https://research.chicagobooth.edu/documents/igm/year-in-review/2018/14/
  - body: 1 13 15 34 2017 - 18 Year in Review 12 During the Myron Scholes Global Markets Forum, business leaders, policymakers, and distinguished scholars speak publicly on issues of current interest. These eve…

## deepmind-blog — 5 random samples

- **Transforming the future of music creation — Google DeepMind** (8953 chars, unknown, hash ok)
  - source_id: `blog/transforming-the-future-of-music-creation`
  - url: https://deepmind.google/blog/transforming-the-future-of-music-creation/
  - body: November 16, 2023 ResearchTransforming the future of music creation ShareAnnouncing our most advanced music generation model, and two new AI experiments designed to open a new playground for creativit…
- **Putting patients at the heart of DeepMind Health — Google DeepMind** (3818 chars, unknown, hash ok)
  - source_id: `blog/putting-patients-at-the-heart-of-deepmind-health`
  - url: https://deepmind.google/blog/putting-patients-at-the-heart-of-deepmind-health/
  - body: September 21, 2016 CompanyPutting patients at the heart of DeepMind HealthMustafa Suleyman, Dominic King ShareFrom the outset, we’ve wanted DeepMind Health to be a truly collaborative effort. Too much…
- **Prefrontal cortex as a meta-reinforcement learning system — Google DeepMind** (6984 chars, unknown, hash ok)
  - source_id: `blog/prefrontal-cortex-as-a-meta-reinforcement-learning-system`
  - url: https://deepmind.google/blog/prefrontal-cortex-as-a-meta-reinforcement-learning-system/
  - body: May 14, 2018 ResearchPrefrontal cortex as a meta-reinforcement learning systemJane Wang, Zeb Kurth-Nelson, Matt Botvinick ShareRecently, AI systems have mastered a range of video-games such as Atari c…
- **Simple Sensor Intentions for Exploration — Google DeepMind** (839 chars, unknown, hash ok)
  - source_id: `blog/simple-sensor-intentions-for-exploration`
  - url: https://deepmind.google/blog/simple-sensor-intentions-for-exploration/
  - body: May 12, 2020 ResearchSimple Sensor Intentions for ExplorationTim Hertweck, Martin Riedmiller, Michael Bloesch, Jost Tobias Springenberg, Noah Siegel, Markus Wulfmeier, Roland Hafner, Nicolas Heess Sha…
- **Producing flexible behaviours in simulated environments — Google DeepMind** (4476 chars, unknown, hash ok)
  - source_id: `blog/producing-flexible-behaviours-in-simulated-environments`
  - url: https://deepmind.google/blog/producing-flexible-behaviours-in-simulated-environments/
  - body: July 10, 2017 ResearchProducing flexible behaviours in simulated environmentsNicolas Heess, Josh Merel, Ziyu Wang ShareThe agility and flexibility of a monkey swinging through the trees or a football…

## huggingface-blog — 5 random samples

- **We now support VLMs in smolagents!** (15212 chars, unknown, hash ok)
  - source_id: `blog/smolagents-can-see`
  - url: https://huggingface.co/blog/smolagents-can-see
  - body: Back to Articles We just gave sight to smolagents Published January 24, 2025 Update on GitHub Upvote 113 +107 Aymeric Roucher m-ric Follow merve merve Follow Albert Villanova del Moral albertvillanova…
- **AssetOpsBench: Bridging the Gap Between AI Agent Benchmarks and Industrial Reality** (13347 chars, unknown, hash ok)
  - source_id: `blog/ibm-research/assetopsbench-playground-on-hugging-face`
  - url: https://huggingface.co/blog/ibm-research/assetopsbench-playground-on-hugging-face
  - body: Back to Articles AssetOpsBench: Bridging the Gap Between AI Agent Benchmarks and Industrial Reality Enterprise Article Published January 21, 2026 Upvote 33 +27 Dhaval Patel DhavalPatel Follow ibm-rese…
- **Arabic Leaderboards: Introducing Arabic Instruction Following, Updating AraGen, and More** (20872 chars, unknown, hash ok)
  - source_id: `blog/leaderboard-3c3h-aragen-ifeval`
  - url: https://huggingface.co/blog/leaderboard-3c3h-aragen-ifeval
  - body: Back to Articles Arabic Leaderboards: Introducing Arabic Instruction Following, Updating AraGen, and More Published April 8, 2025 Update on GitHub Upvote 20 +14 Ali El Filali alielfilali01 Follow ince…
- **AprielGuard: A Guardrail for Safety and Adversarial Robustness in Modern LLM Systems** (16433 chars, unknown, hash ok)
  - source_id: `blog/ServiceNow-AI/aprielguard`
  - url: https://huggingface.co/blog/ServiceNow-AI/aprielguard
  - body: Back to Articles AprielGuard: A Guardrail for Safety and Adversarial Robustness in Modern LLM Systems Enterprise Article Published December 23, 2025 Upvote 48 +42 Jaykumar Kasundra JayKasundraSNOW Fol…
- **AI Policy @🤗: Response to the White House AI Action Plan RFI** (5481 chars, unknown, hash ok)
  - source_id: `blog/ai-action-wh-2025`
  - url: https://huggingface.co/blog/ai-action-wh-2025
  - body: Back to Articles AI Policy @🤗: Response to the White House AI Action Plan RFI Published March 19, 2025 Update on GitHub Upvote 30 +24 Yacine Jernite yjernite Follow Avijit Ghosh evijit Follow Irene S…

## ibm-research — 5 random samples

- **Quantum Theory and Application of Contextual Optimal Transport for NeurIPS 2023** (2011 chars, unknown, hash ok)
  - source_id: `publications/quantum-theory-and-application-of-contextual-optimal-transport`
  - url: https://research.ibm.com/publications/quantum-theory-and-application-of-contextual-optimal-transport
  - body: AbstractOptimal Transport (OT) has fueled machine learning (ML) applications across various domains. In cases where paired data measurements (μ, ν) are coupled to a context variable pi, one may aspire…
- **Snap&Nav: Smartphone-based Indoor Navigation System for Blind People via Floor Map Analysis and Intersection Detection for PACM HCI** (1649 chars, unknown, hash stale)
  - source_id: `publications/snapandampnav-smartphone-based-indoor-navigation-system-for-blind-people-via-floor-map-analysis-and-intersection-detection`
  - url: https://research.ibm.com/publications/snapandampnav-smartphone-based-indoor-navigation-system-for-blind-people-via-floor-map-analysis-and-intersection-detection
  - body: AbstractWe present Snap&Nav, a navigation system for blind people in unfamiliar buildings, without prebuilt digital maps. Instead, the system utilizes the floor map as its primary information source f…
- **Empowering Developers with Markdown-based Documentation for Better Software Maintenance for NEDB 2026** (2637 chars, unknown, hash ok)
  - source_id: `publications/empowering-developers-with-markdown-based-documentation-for-better-software-maintenance`
  - url: https://research.ibm.com/publications/empowering-developers-with-markdown-based-documentation-for-better-software-maintenance
  - body: AbstractIn the fast-evolving landscape of software engineering, developers grapple with sprawling markdown-based documentation - project wikis, API specs, and internal guides that often bury critical…
- **A Multi-Agent Framework for Enterprise Tool Creation for AAAI 2026** (1656 chars, unknown, hash ok)
  - source_id: `publications/a-multi-agent-framework-for-enterprise-tool-creation`
  - url: https://research.ibm.com/publications/a-multi-agent-framework-for-enterprise-tool-creation
  - body: AbstractAlthough LLMs can generate tools for generic domains and tasks, they struggle with enterprise-related domains that involve proprietary APIs and data schemas. We present ToolSmith, a framework…
- **Low SWaP Multi-spectral Imager: Design and Applications for GOMACTech 2020** (1190 chars, unknown, hash stale)
  - source_id: `publications/low-swap-multi-spectral-imager-design-and-applications`
  - url: https://research.ibm.com/publications/low-swap-multi-spectral-imager-design-and-applications
  - body: AbstractAn IR camera, a visible-domain camera, a 3-D 60- GHz mmWave radar imager, and a tablet for visualization and control are integrated in a 10.5”×10“×5.75” volume realizing a portable multi-spect…

## mcp-spec — 5 random samples

- **Group Charter Template - Model Context Protocol** (5717 chars, unknown, hash ok)
  - source_id: `community/charter-template`
  - url: https://modelcontextprotocol.io/community/charter-template
  - body: Skip to main contentModel Context Protocol home pageSearch...⌘KSearch...NavigationGet InvolvedGroup Charter TemplateDocumentationExtensionsSpecificationRegistrySEPsCommunityGet InvolvedContributing to…
- **Cancellation - Model Context Protocol** (2568 chars, unknown, hash ok)
  - source_id: `specification/2024-11-05/basic/utilities/cancellation`
  - url: https://modelcontextprotocol.io/specification/2024-11-05/basic/utilities/cancellation
  - body: Skip to main contentModel Context Protocol home pageVersion 2024-11-05Search...⌘KSearch...NavigationUtilitiesCancellationDocumentationExtensionsSpecificationRegistrySEPsCommunitySpecificationArchitect…
- **Architecture - Model Context Protocol** (4496 chars, unknown, hash ok)
  - source_id: `specification/2025-03-26/architecture`
  - url: https://modelcontextprotocol.io/specification/2025-03-26/architecture
  - body: Skip to main contentModel Context Protocol home pageVersion 2025-03-26Search...⌘KSearch...NavigationArchitectureDocumentationExtensionsSpecificationRegistrySEPsCommunitySpecificationKey ChangesArchite…
- **SEP-1865: MCP Apps - Interactive User Interfaces for MCP - Model Context Protocol** (8544 chars, unknown, hash ok)
  - source_id: `seps/1865-mcp-apps-interactive-user-interfaces-for-mcp`
  - url: https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
  - body: Skip to main contentModel Context Protocol home pageSearch...⌘KSearch...NavigationFinalSEP-1865: MCP Apps - Interactive User Interfaces for MCPDocumentationExtensionsSpecificationRegistrySEPsCommunity…
- **Prompts - Model Context Protocol** (5881 chars, unknown, hash ok)
  - source_id: `specification/2025-06-18/server/prompts`
  - url: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
  - body: Skip to main contentModel Context Protocol home pageVersion 2025-06-18Search...⌘KSearch...NavigationServer FeaturesPromptsDocumentationExtensionsSpecificationRegistrySEPsCommunitySpecificationKey Chan…

## mistral-blog — 5 random samples

- **Announcing Codestral 25.08 and the Complete Mistral Coding Stack for Enterprise | Mistral AI** (13099 chars, unknown, hash ok)
  - source_id: `news/codestral-25-08`
  - url: https://mistral.ai/news/codestral-25-08
  - body: Announcing Codestral 25.08 and the Complete Mistral Coding Stack for EnterpriseResearchJul 30, 2025Mistral AIHow the world’s leading enterprises are using integrated coding solutions from Mistral AI t…
- **Evaluating RAG with LLM as a Judge | Mistral AI** (7485 chars, unknown, hash ok)
  - source_id: `news/llm-as-rag-judge`
  - url: https://mistral.ai/news/llm-as-rag-judge
  - body: Evaluating RAG with LLM as a JudgeSolutionsUsing Mistral Models for LLM as a Judge (With Structured Outputs)Apr 9, 2025Mistral AI TeamLarge Language Models (LLMs) are rapidly becoming essential tools…
- **Our contribution to a global environmental standard for AI | Mistral AI** (7680 chars, unknown, hash ok)
  - source_id: `news/our-contribution-to-a-global-environmental-standard-for-ai`
  - url: https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai
  - body: Our contribution to a global environmental standard for AICompanyJul 22, 2025Mistral AIAt Mistral AI, our mission is to bring artificial intelligence in everyone’s hands. For this purpose, we have con…
- **Unlocking the potential of vision language models on satellite imagery through fine-tuning | Mistral AI** (7467 chars, unknown, hash ok)
  - source_id: `news/unlocking-potential-vision-language-models-satellite-imagery-fine-tuning`
  - url: https://mistral.ai/news/unlocking-potential-vision-language-models-satellite-imagery-fine-tuning
  - body: Unlocking the potential of vision language models on satellite imagery through fine-tuningSolutionsAug 1, 2025Mistral AIFine-tuning foundation models is transforming how we apply AI to real-world prob…
- **Introducing Le Chat Enterprise | Mistral AI** (4332 chars, unknown, hash ok)
  - source_id: `news/le-chat-enterprise`
  - url: https://mistral.ai/news/le-chat-enterprise
  - body: Introducing Le Chat EnterpriseProductYour Enterprise. Your AI.May 7, 2025Mistral AIToday, we’re proud to introduce Le Chat Enterprise — a feature-rich AI assistant, powered by our brand new Mistral Me…

## mit-csail — 5 random samples

- **Human-machine teaming dives underwater | MIT CSAIL** (9358 chars, unknown, hash ok)
  - source_id: `news/human-machine-teaming-dives-underwater`
  - url: https://www.csail.mit.edu/news/human-machine-teaming-dives-underwater
  - body: Back to News April 14 '26 Human-machine teaming dives underwater Written By Ariana Gaines | Lincoln Laboratory The electricity to an island goes out. To find the break in the underwater power cable, a…
- **To build a better AI helper, start by modeling the irrational behavior of humans | MIT CSAIL** (6839 chars, unknown, hash ok)
  - source_id: `news/build-better-ai-helper-start-modeling-irrational-behavior-humans`
  - url: https://www.csail.mit.edu/news/build-better-ai-helper-start-modeling-irrational-behavior-humans
  - body: Back to News April 19 '24 To build a better AI helper, start by modeling the irrational behavior of humans Written By Adam Zewe | MIT News To build AI systems that can collaborate effectively with hum…
- **New control system teaches soft robots the art of staying safe | MIT CSAIL** (10085 chars, unknown, hash ok)
  - source_id: `news/new-control-system-teaches-soft-robots-art-staying-safe`
  - url: https://www.csail.mit.edu/news/new-control-system-teaches-soft-robots-art-staying-safe
  - body: Back to News December 02 '25 New control system teaches soft robots the art of staying safe Written By Rachel Gordon Imagine having a continuum soft robotic arm bend around a bunch of grapes or brocco…
- **Helping data centers deliver higher performance with less hardware | MIT CSAIL** (8043 chars, unknown, hash ok)
  - source_id: `news/helping-data-centers-deliver-higher-performance-less-hardware`
  - url: https://www.csail.mit.edu/news/helping-data-centers-deliver-higher-performance-less-hardware
  - body: Back to News April 07 '26 Helping data centers deliver higher performance with less hardware Written By Adam Zewe | MIT News To improve data center efficiency, multiple storage devices are often poole…
- **From recurrent networks to GPT-4: Measuring algorithmic progress in language models | MIT CSAIL** (6082 chars, unknown, hash ok)
  - source_id: `news/recurrent-networks-gpt-4-measuring-algorithmic-progress-language-models`
  - url: https://www.csail.mit.edu/news/recurrent-networks-gpt-4-measuring-algorithmic-progress-language-models
  - body: Back to News March 12 '24 From recurrent networks to GPT-4: Measuring algorithmic progress in language models Written By Rachel Gordon In 2012, the best language models were small recurrent networks t…

## openai-news — 5 random samples

- **Introducing Trusted Contact in ChatGPT** (7092 chars, full_text, hash ok)
  - source_id: `https://openai.com/index/introducing-trusted-contact-in-chatgpt`
  - url: https://openai.com/index/introducing-trusted-contact-in-chatgpt
  - body: Skip to main contentLog inTry ChatGPT(opens in a new window)ResearchProductsBusinessDevelopersCompanyFoundation(opens in a new window)Try ChatGPT(opens in a new window)LoginOpenAIMay 7, 2026SafetyIntr…
- **Scaling Codex to enterprises worldwide** (191 chars, source_summary, hash ok)
  - source_id: `https://openai.com/index/scaling-codex-to-enterprises-worldwide`
  - url: https://openai.com/index/scaling-codex-to-enterprises-worldwide
  - body: OpenAI launches Codex Labs, partners with with Accenture, PwC, Infosys, and others to help enterprises deploy and scale Codex across the software development lifecycle, and hits 4M Codex WAU.…
- **Working with Codex** (139 chars, source_summary, hash ok)
  - source_id: `https://openai.com/academy/working-with-codex`
  - url: https://openai.com/academy/working-with-codex
  - body: Learn how to set up your Codex workspace, create threads and projects, manage files, and start completing tasks with step-by-step guidance.…
- **OpenAI models, Codex, and Managed Agents come to AWS** (137 chars, source_summary, hash ok)
  - source_id: `https://openai.com/index/openai-on-aws`
  - url: https://openai.com/index/openai-on-aws
  - body: OpenAI GPT models, Codex, and Managed Agents are now available on AWS, enabling enterprises to build secure AI in their AWS environments.…
- **Codex settings** (1874 chars, full_text, hash ok)
  - source_id: `https://openai.com/academy/codex-settings`
  - url: https://openai.com/academy/codex-settings
  - body: Skip to main contentLog inTry ChatGPT(opens in a new window)ResearchProductsBusinessDevelopersCompanyFoundation(opens in a new window)Try ChatGPT(opens in a new window)LoginOpenAIApril 23, 2026OpenAI…

## perplexity-research — 5 random samples

- **Efficient and Portable Mixture-of-Experts Communication** (23752 chars, full_text, hash ok)
  - source_id: `articles/efficient-and-portable-mixture-of-experts-communication`
  - url: https://research.perplexity.ai/articles/efficient-and-portable-mixture-of-experts-communication
  - body: systemsApr 2, 2025Efficient and Portable Mixture-of-Experts CommunicationAn overview of portable Mixture-of-Experts (MoE) communication, focusing on optimizing GPU parallelism and reducing latency in…
- **Lower Latency and Higher Throughput with Multi-node DeepSeek Deployment** (26895 chars, full_text, hash ok)
  - source_id: `articles/lower-latency-and-higher-throughput-with-multi-node-deepseek-deployment`
  - url: https://research.perplexity.ai/articles/lower-latency-and-higher-throughput-with-multi-node-deepseek-deployment
  - body: systemsApr 18, 2025Lower Latency and Higher Throughput with Multi-node DeepSeek DeploymentMulti-GPU deployment boosts MoE model performance on both speed and scale fronts simultaneouslyIn most systems…
- **High-Performance GPU Memory Transfer on AWS Sagemaker Hyperpod** (8391 chars, full_text, hash ok)
  - source_id: `articles/high-performance-gpu-memory-transfer-on-aws-sagemaker-hyperpod`
  - url: https://research.perplexity.ai/articles/high-performance-gpu-memory-transfer-on-aws-sagemaker-hyperpod
  - body: systemsFeb 10, 2025High-Performance GPU Memory Transfer on AWS Sagemaker HyperpodJourney to 3200 GbpsModern deep learning infrastructure often requires transferring large amounts of data between GPUs…
- **BrowseSafe: Understanding and Preventing Prompt Injection Within AI Browser Agents** (16666 chars, full_text, hash ok)
  - source_id: `articles/browsesafe`
  - url: https://research.perplexity.ai/articles/browsesafe
  - body: securityDec 2, 2025BrowseSafe: Understanding and Preventing Prompt Injection Within AI Browser AgentsDefense architecture, benchmark, and detection model for securing AI agents in open-world web envir…
- **Designing, Refining, and Maintaining Agent Skills at Perplexity** (23139 chars, full_text, hash ok)
  - source_id: `articles/designing-refining-and-maintaining-agent-skills-at-perplexity`
  - url: https://research.perplexity.ai/articles/designing-refining-and-maintaining-agent-skills-at-perplexity
  - body: researchMay 1, 2026Designing, Refining, and Maintaining Agent Skills at PerplexityPerplexity’s frontier agent products rest on a foundation of know-how and domain expertise packaged in modular Agent S…

## stanford-hai — 5 random samples

- **Washington Post: Stanford helped pioneer artificial intelligence. Now the university wants to put humans at its center. | Stanford HAI** (613 chars, unknown, hash stale)
  - source_id: `news/washington-post-stanford-helped-pioneer-artificial-intelligence-now-university-wants-put`
  - url: https://hai.stanford.edu/news/washington-post-stanford-helped-pioneer-artificial-intelligence-now-university-wants-put
  - body: This site can’t be reached The webpage at https://www.washingtonpost.com/technology/2019/03/18/stanford-helped-pioneer-artificial-intelligence-now-university-wants-put-humans-its-center?noredirect=on&…
- **​Who is winning the artificial intelligence race? | Stanford HAI** (3039 chars, unknown, hash ok)
  - source_id: `news/who-winning-artificial-intelligence-race`
  - url: https://hai.stanford.edu/news/who-winning-artificial-intelligence-race
  - body: In a recent talk at Stanford, Kai-Fu Lee says China has taken the lead. Lee is a venture capitalist and author of “AI Superpowers: China, Silicon Valley and the New World Order.”Related NewsWant To Un…
- **Carlos Guestrin to Lead Stanford AI Lab as it Joins Forces with Stanford HAI | Stanford HAI** (9032 chars, unknown, hash ok)
  - source_id: `news/carlos-guestrin-to-lead-stanford-ai-lab-as-it-joins-forces-with-stanford-hai`
  - url: https://hai.stanford.edu/news/carlos-guestrin-to-lead-stanford-ai-lab-as-it-joins-forces-with-stanford-hai
  - body: The computer scientist will invest in SAIL’s vibrant research community as it builds the future of technical AI.As artificial intelligence rapidly transforms our world, its early breakthroughs were pi…
- **Reflections on Foundation Models | Stanford HAI** (19034 chars, unknown, hash ok)
  - source_id: `news/reflections-foundation-models`
  - url: https://hai.stanford.edu/news/reflections-foundation-models
  - body: After launching the Center for Research on Foundation Models, we discuss why these models are so important and reflect on the community response.Recently, we released our report on foundation models,…
- **Stanford launches effort to steer artificial intelligence to help, not harm, humans | Stanford HAI** (327 chars, unknown, hash stale)
  - source_id: `news/stanford-launches-effort-steer-artificial-intelligence-help-not-harm-humans`
  - url: https://hai.stanford.edu/news/stanford-launches-effort-steer-artificial-intelligence-help-not-harm-humans
  - body: www.bizjournals.comPerforming security verificationThis website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.Verificat…

## Verdict: ⚠️ FAIL

worst non-baseline stub %: 38% (gate: ≤5%)
stale content_hash rows: 163 (gate: 0)
challenge shell rows: 10 (gate: 0)
