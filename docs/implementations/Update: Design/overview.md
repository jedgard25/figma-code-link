We have created a figma plugin (figma-code-link/docs/architecture.md) to enable quick and easy design review and component creation: linking Figma, and code, together.

The newest addition was a svelte-adapter. However, design wise, it has some issues and is incongruent with the nextjs-adapter. 

Today, we'd like to: implement a stable design system between the two.

## Updates

Your job is going to be as a lead designer, to improve, solidify, and set up our unified repo with a good design system and patterns for clean, professional, modern Figma-like design and parity. 

1. We need to align the two adapters. On some consideration, I think it's fine to ingest two different headless libraries (Radix, probably Bits UI. You can use lucide as icon library) and use a *shared CSS token system* for the two. I've imported a basic one via tokens-export.css, you can use.
2. Implement the tokens, Identify what components need to be installed via their libraries, style them in a unified manor. it's important to maintain the .css as source of truth and avoid class duplication. 
3. The figma plugin structure itself is roughly fine, but it can be rewritten / updated to follow standards you align to above, so we have **as much token standarization and visual parity as possible.** Any old design debt, and non-standarization here will become very annoying to deal with in the future as adding features has technical debt in 3+ places.

