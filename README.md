# gitleap
GitLeap redefines how developers consume open-source software by shifting the paradigm from monolithic asset cloning to modular capability extraction. By appending gitleap.com to any arbitrary GitHub repository URL, our engine utilizes a Map-Reduce AI pipeline and static AST parsing to filter out legacy boilerplate, fix code anti-patterns, and synthesize codebases into highly structured, premium 'Ready Packs'. Every generated pack includes a machine-readable skills-manifest.json compliant with modern AI agent standards (like Anthropic’s skills.sh), pristine, isolated execution primitives, and a zero-config local runner, allowing developers and AI assistants to import verified engineering capabilities into local workspaces instantly.

>[!NOTE]
>Turn any chaotic GitHub repository into a curated, downloadable Skills Collection with a single URL swap. Stop wasting hours auditing messy enterprise codebases or fighting out-of-date package lockfiles. GitLeap acts as an expert systems engineer that processes any repo on-the-fly, generating a token-optimized, structurally perfect bundle that your local IDE and AI code assistants (like Cursor and Claude Code) can ingest and execute immediately."

When a user initiates the URL swap **(://github.com... ➔ ://gitleap.com...)**, the system splits the heavy structural analysis and AI code refactoring into isolated, asynchronous execution stages.

```
📦 [SKILLS]/
├── 📝 SKILL.md                 # Highly optimized semantic guide matching skills.sh standard
├── ⚙️ skills-manifest.json      # Machine-readable schema mapping all canonical tools for Cursor/Claude Code
├── 🚀 setup.sh                 # Zero-config script installing necessary SDKs and lockfile environments
└── 📂 skills/                  # Pristine, isolated code primitives stripped of junk, legacy examples, or logs
    │
    ├── 🔹 01_data_analyst/
    │   ├── canonical_agent.py  # Production-grade Python code interpreter following o1/o3-mini best practices
    │   ├── config.env.example  # Cleansed env matrix requesting strictly: E2B_API_KEY & OPENAI_API_KEY
    │   └── local_verify.test.py# Auto-generated assertion test running a mock CSV interpretation test
    │
    ├── 🔹 02_mcp_research_agent/
    │   ├── runtime.ts          # Perfect TypeScript implementation orchestrating arXiv, Groq, and DuckDuckGo
    │   ├── config.env.example  # Formatted env keys for GROQ_API_KEY and EXA_API_KEY
    │   └── local_verify.test.ts# Quick integration test validating localized MCP server handshake
    │
    ├── 🔹 03_langchain_interpreter/
    │   ├── bridge.py           # Streamlined integration blueprint coupling LangChain with secure sandboxing
    │   └── config.env.example  # Standardized environment keys for LangChain tracking variables
    │
    └── 🔹 04_browserbase_automation/
        ├── automation.ts       # Flawless Web automation agent using Browserbase MCP server best practices
        └── config.env.example  # Formatted env keys for BROWSERBASE_API_KEY
```

## Universal Skill Factory 
> any legacy GitHub repository into a downloadable, production-grade skills.sh-compliant pack on the fly.
```
[ A messy, unstructured GitHub repository URL ]
                       │
                       ▼ (User changes domain to yourskillfactory.com)
┌────────────────────────────────────────────────────────────────────────┐
│ 1. THE INGESTION LAYER                                                 │
│    Streams raw code, scripts, and documentation into the pipeline.     │
├────────────────────────────────────────────────────────────────────────┘
│ 2. THE AI SYNTHESIS LAYER                                              │
│    An LLM dynamically refactors code into strict canonical primitives. │
├────────────────────────────────────────────────────────────────────────┘
│ 3. THE COMPLIANT COMPILER                                              │
│    Auto-generates the exact schema structure required by skills.sh.    │
└────────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
[ Instant Output: A valid 'npx skills' ready pack tailored to your tool ]
```

## Skill Name: [Generated Capability]
A dynamically extracted skill to execute specific production tasks.

### Description
[AI-optimized description to improve agent triggering accuracy]

### Usage
```$ gitleap run [skill-id] --param="value"```
### Installation
```$ npx skills add https://gitleap.com/[auto-generated-id] --skill -y```

# Technical Design
> To handle massive enterprise codebases with tens of thousands of files accurately, your engine cannot simply dump the entire repository into an LLM context window. Doing so causes context bloating, breaks token limits, inflates costs, and triggers heavy AI hallucinations. [1] 
Instead, your engine must use a multi-layered, deterministic processing system. It acts like an automated compiler, processing large-scale codebases through a structured, three-stage extraction pipeline. [2] 
------------------------------
## Phase 1: Static AST Parsing & Code Graph Indexing
Before any AI model reads a single line of code, the engine uses ultra-fast static analysis tools like Tree-sitter to parse the repository. [2, 3] 

* The Hierarchy Map: It builds a persistent, language-agnostic knowledge graph of the codebase. It maps out class hierarchies, imports, function signatures, and exact call graphs. [2, 4] 
* Relevance Filtering: It systematically strips out test suites, vendor files, migration scripts, and compiled binaries using automatic git-ignore logic. [5] 
* Abstracting the Noise: Instead of looking at 50,000 lines of implementation code, the engine views the repository as a lean topological tree of capabilities and entrypoints.

------------------------------
## Phase 2: Map-Reduce Semantic Slicing
To keep processing highly accurate, the engine never feeds the entire codebase to an LLM at once. It breaks the analysis down using a Map-Reduce pattern across isolated worker pools: [1, 2, 6] 
```
[ Massive 10GB Enterprise Repo ] 
                │
                ▼ (AST Structural Analysis)
┌──────────────────────────────────────────────┐
│ MAP STAGE: Divide into decoupled modules     │
│ (e.g., /auth, /billing, /routing-engine)      │
└──────────────────────┬───────────────────────┘
                       │
                       ▼ (LLMs process small modules in parallel)
┌──────────────────────────────────────────────┐
│ REFACTOR STAGE: Strip junk, optimize code,    │
│ write 'local_verify.test' per module         │
└──────────────────────┬───────────────────────┘
                       │
                       ▼ (Merge extracted primitives)
┌──────────────────────────────────────────────┐
│ REDUCE STAGE: Compile into final unified     │
│ `skills-manifest.json` and zip file          │
└──────────────────────────────────────────────┘
```

   1. Map: The engine splits the massive codebase into semantically coherent components based on the code graph (e.g., routing engine, data sanitization module, webhook handlers). [3] 
   2. Refactor: Dedicated, parallel AI worker instances process each micro-component independently. They extract only the core functional path, clean up the anti-patterns, and write the isolated canonical code block and its environment variables. [2] 
   3. Reduce: A central compiler merges all the extracted, optimized primitives back together, generating a clean skills-manifest.json file for the entire project.

------------------------------
## Phase 3: Token-Optimized Context Compression
Enterprise engineers and local AI agents need these packs to be small and fast. The output generator applies precise optimizations to the downloadable bundle:

* Caching via Token Efficiency: The engine aggressively condenses text. For instance, a 2,000-line documentation file is synthesized into a concise, token-optimized AI-CONTEXT.md file that matches the high-trigger accuracy rules of tools like skills.sh. [6] 
* Secret Data Protection: Before compiling the final download pack, the system runs an automated scanner to ensure that internal corporate secrets, hardcoded database passwords, or production API keys are blocked and never bundled into the public-facing export. [4, 7] 

## The Resulting System Behavior
When applied to a massive enterprise project, the engine behaves less like a basic translator and more like an automated architectural extraction factory. [2] 
A 5GB enterprise codebase containing chaotic, decades-old code is parsed asynchronously. Within a minute, it is compressed into a clean, 15MB zipped collection of 10-15 perfectly refactored canonical skill directories, ready for any developer or AI teammate to download and run locally. [8] 

## The Architecture Block Diagram
```
[ User Browser / AI Client ]
             │
             ▼ (GET ://gitleap.com)
┌────────────────────────────────────────────────────────┐
│ 1. INGRESS & EDGE CACHE                                │
│    Validates URL, checks Redis for an existing Pack.   │
└────────────────────────────┬───────────────────────────┘
                             │ (Cache Miss ➔ Push Event)
                             ▼
┌────────────────────────────────────────────────────────┐
│ 2. ASYNCHRONOUS EVENT QUEUE (RabbitMQ / NATS)          │
│    Absorbs traffic spikes; distributes processing jobs.│
└────────────────────────────┬───────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────┐
│ 3. PIPES & FILTERS WORKER ENGINE                       │
│    Step A: Stream Tarball ➔ Step B: AST Structural Map │
│    ➔ Step C: AI Module Slicing ➔ Step D: Code Refactor │
└────────────────────────────┬───────────────────────────┘
                             │ (Compilation Complete)
                             ▼
┌────────────────────────────────────────────────────────┐
│ 4. DISKLESS COMPRESSED STREAMER                        │
│    Generates manifests, bundles files, streams .tar.gz │
└────────────────────────────────────────────────────────┘
```

### The 4 Behavioral Stages of GitLeapStage 
- 1: The Ingress Edge Check (Instant Response)
> [!NOTE]
> What happens: The HTTP Ingress Gateway intercepts the request. It extracts the repository organization, name, and target commit hash from the URL path.The System Behavior: It immediately checks a global Redis distributed cache.If a matching commit hash exists: It instantly redirects the browser or AI agent to a pre-compiled download stream. The entire transaction takes under 50 milliseconds.If a cache miss occurs: It registers a new unique tracking ID, submits a Repo.Processing event into the asynchronous queue, and returns an HTTP 202 Accepted status to stream a real-time progress page via WebSockets.
- Stage 2: The Map-Reduce AST Slicing (Deep Structural Parsing)
> [!NOTE]
> What happens: An isolated worker service consumes the event, streams the repository's source tarball directly via the GitHub API, and untars it into an in-memory execution volume.The System Behavior: The engine uses Tree-sitter static analysis to index the codebase language targets. It maps out dependencies, function blocks, and entry points, while completely dropping non-functional code (docs, asset assets, configurations).The Enterprise Scaling Behavior: If the repository is massive, the system splits the AST tree into decoupled sub-modules. Each module is sent out in parallel to separate AI worker threads to bypass context limits.
- Stage 3: The Parallel Refactoring Engine (The Ingestion Filter)
> [!NOTE]
> What happens: The AI Worker pool processes the isolated code files through a series of deterministic engineering rules.The System Behavior: It feeds each capability block to an LLM context window with strict system prompts: Strip out platform-specific hacks, optimize variable names, align package dependencies, and output a pristine implementation file. Simultaneously, it generates a localized integration test (validation.test) to guarantee that the output can assert itself locally.
- Stage 4: The Clean Archive Compilation (The Delivery)
> [!NOTE]
> What happens: The Compilation service aggregates all the independently refactored module blocks back into a single pipeline.The System Behavior: It auto-synthesizes the machine-readable skills-manifest.json and the Anthropic-ready SKILL.md file based on the extracted capabilities. It injects a localized universal setup.sh and run-skill.sh script, zips the entire structure into a streaming .tar.gz object buffer, updates the Redis cache state, and signals the WebSocket to trigger the instant download for the user.
