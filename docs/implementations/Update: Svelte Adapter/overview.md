We have created a figma plugin (figma-code-link/docs/architecture.md) to enable quick and easy design review and component creation: linking Figma, and code, together.

1. A NextJS adapter was built, and now we need to make a similar svelte adapter. The repo provided (origami-app/) has an early adapter embedded into the project. This should be referenced.
2. A svelte adapter should be made: As origami-app/ has a complex structure, the CID Preprocessor is quite complex to fill edge cases, and inject incorrectly / break the code on build. Consider what you should be made universal for end-users, and where the end user may need to make a compatibility layer with their specific project. What does this look like? Do we ship with the complex CID, or use a system to let the end-user spec it for their repo?
3. Once designed: you have to get it working. Archive or remove the original adapter in the origami-app/ repo, and install the one you've built. Make any final modifications for a seamless transition.


## Architectural Patterns (notes)
- I believe the existing next-js adapter design requires a seperate server to be started (npm run figma-link) but this is kind of annoying. Can we safely have it automatically start via the main `npm run dev` for both svelte and nextjs? 
- Can we fully remove dependencies? I'm unfamilar, but I know that `html2canvas` had to be installed by the end user, in a next-js repo (not provided). If we can remove this dependency that would be nice, but it's not a deal breaker.
- How are we designing the Figma plugin right now? Because I wouldn't mind just using Radix / Bits UI (can we?) and my tokens-export.css provided. However we can make development cleaner.


## Goals
- We get the svelte adapter up and running so I can use it with the origami-app repo development.
- We make any necessary improvements to the architecture of the plugin, adapter, and CID patterns to make the plugin more mature and stable for quick installation by end users.