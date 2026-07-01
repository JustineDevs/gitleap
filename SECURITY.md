# Security Policy (SECURITY.md)

## 1. Our Security Philosophy
**GitLeap** operates on a **Zero-Trust Ingestion Paradigm**. Because our platform allows users to instantly transmute any public or enterprise GitHub repository into downloadable Skills Packs using a simple URL swap, we treat all source code as fundamentally hostile and untrusted. 

Our system architecture ensures that code from ingested repositories is analyzed purely as static semantic text trees, completely eliminating the risk of arbitrary code execution on GitLeap infrastructure.

---

## 2. Platform Threat Mitigation & Guardrails

To ensure absolute safety for our cloud ecosystem and our users, GitLeap enforces three core architectural security guardrails:

### A. Non-Execution Environment Guarantee
*   **Static Parsing Only:** Ingested codebases are broken down into language-agnostic text trees using tools like Tree-sitter. GitLeap workers read files purely as structural metrics and plain text strings.
*   **Zero-Runtime Backend:** GitLeap backend workers **never** compile, execute, or boot the ingested codebase. The repository code is never allowed to execute shell commands, access networking layers, or interface with system processes on our processing nodes.
*   **Execution Risk Isolation:** The generated "Ready Pack" remains entirely passive. The ultimate execution of the canonical skills happens exclusively on the end-user's local hardware or within their own sandboxed client environments, ensuring our platform is never used to host or distribute live malware or botnets.

### B. Ephemeral Diskless Workspaces
*   **Memory-Only Slicing:** Ingested repository zip/tarball streams are processed directly inside volatile, in-memory isolated filesystems (`tmpfs`). 
*   **Instant Destruction:** As soon as the Map-Reduce pipeline finishes refactoring and zips the final downloadable output pack, the temporary memory buffer is completely overwritten and demolished. No user code persists on GitLeap workers.
*   **Data Leakage Prevention:** Multi-tenant separation ensures that worker threads processing distinct repositories never share memory space, eliminating the possibility of cross-contamination or unauthorized data leakage.

### C. Automated Secret Scrubbing
*   **Pre-Compilation Scan:** Before compiling the final `skills-manifest.json` and zipping the download archive, GitLeap runs an automated entropy and regex check across the refactored code primitives.
*   **Leaked Key Blocking:** If the source repository contains leaked corporate API tokens, hardcoded SSH private keys, database strings, or environmental passwords, GitLeap automatically redacts them, inserts variable placeholding tokens (`YOUR_API_KEY_HERE`), and maps them securely to the `config.env.example` matrix.

---

## 3. Reporting a Vulnerability

We take the security of our platform, our users, and the open-source ecosystem seriously. If you discover a security vulnerability within GitLeap’s ingestion layer, API routing, or caching systems, please report it to us immediately through our coordinated disclosure channel.

### How to Submit a Report
*   **Email:** Please send an encrypted or standard email to **`security@gitleap.com`**.
*   **Required Details:** To help us triage and resolve the issue quickly, please include:
    *   A detailed description of the vulnerability.
    *   The specific component or API route affected.
    *   Step-by-step instructions or a Proof of Concept (PoC) script to reproduce the issue.
    *   An assessment of the potential impact (e.g., denial of service, worker crash, data bypass).

### Our Commitment to You
*   **Acknowledgment:** We will acknowledge receipt of your vulnerability report within **24 hours**.
*   **Triage and Fix:** We will keep you updated as our core engineering team validates, patches, and deploys a mitigation for the identified issue.
*   **Confidentiality:** We ask that you follow responsible disclosure guidelines and refrain from publishing or disclosing the vulnerability to the public until we have successfully deployed a fix to secure the ecosystem.

---

## 4. Supported Versions

We actively maintain and apply security patches exclusively to the latest live version of the GitLeap cloud compiler engine:

| Version | Supported | Security Patches |
| :--- | :--- | :--- |
| **v0.x (Current Engine)** | ✅ Yes | Enforced immediately across all live distributed workers. |
| **Experimental Branches** | ❌ No | Best effort only. Do not use for proprietary enterprise codebases. |
