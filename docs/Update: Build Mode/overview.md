We're working on a figma plugin and individual adapters. We are going to build out the `adapter-nextjs` in tandem with the `figma-plugin`.

## High Level Tasks

We are shifting concepts to have two modes: "Build" mode, and "Review" mode. So far we've built an MVP "Review" mode (leaving website comments, discoverable in the Figma plugin) to "Build" mode.

It is the same idea, but it enables creation on the Figma Plugin side:

1. user opens plugin
2. user is faced with a "job queue" 
3. user selects a component to add to the job queue
4. user enters any comments on the selected component and clicks `Queue`
5. an entry is generated in `review.json` or, probably better, `figma-tasks.json`

entry schema:

```figma-tasks.json
{
  "version": 1,
  "entries": [
    {
      "entryId": "uuid",
      "cid": "Button.svelte:42", // tells us file and location. If a data-cid is hand written, Copilot of course can just grep to it.
      "comment": "This button doesn't look right",
      "figmaNodeId": "1234:567",
      "figmaNodeName": "Button / Primary",
      "status": "to-build", // semantic "task" status label. E.g this one needs to be built. Then the LLM builds it, the flips it to "review". Probably we limit to {"to-build", "to-fix", "review", "completed"}
      "timestamp": "2026-02-28T12:05:00Z" // not sure timestamp is necessary but maybe good for ordering? 
    }
  ]
}
```
## Tasks

1. [ ] - We need to create a basic adapter-nextjs for usage in our test nextjs repo, `evin-drews-site`. It should be an easy to integrate package (e.g just plugs into `layout.tsx`). We can scaffold with the idea of `Review` mode, but we really just need the server right now, to allow connection to the figma-plugin. The server side should generate the `figma-tasks.json` (if non-existent) so the figma plugin can write, edit, and delete job queue entries. Build in the figma-code-link repo, then publish / install into `evin-drews-site` via `yalc`, integrate it, then run the dev build (`npm run dev`)


2. [ ] - We need to scaffold the `Build` mode of the app. This will involve essentially rewriting it to perform actions with the server API. The app will have multiple screens for user flow:

```
<!-- Screens -->

`view.build.window`
- [navbar.component]
- [queue.component]
- [toolbar.component]

`view.review.window`
- [navbar.component]
- [empty] // unbuilt for now

`view.server.window`
- ["Waiting for server"] // the screen that's shown when server not up

<!-- Primary Components -->

`navbar`
- [`build` | `Review` | `Clear All`]

`toolbar`
- [`Add to Queue` | `Copy Set`]

`queue`
- [queue.item]
- [queue.item]
- ...

`queue.item` // queue item. Has the thumbnail on the left (maybe like max-width: 25%) then metadata and actions
- .horizontal.container(thumbnail | details)
- ..details.column.container (figma.component.name, note, action.row)
- ...action.row(status.tag, button.delete, button.copy)

`new.item`
- floats over the build.view, (modal overlay) fills the screen with like 10px gap, so you can see the UI below. We overlay a grey solid so the UI behind is a little faded.
- ..

```

## Flow

```
1. user app connects to API, displays build view with empty queue.component with ("No queued design tasks.") text.
2. User clicks `Add to Queue` button
3. `new.item popover fills the screen ("Select New Component", "Select a new component to create a ticket.", button.secondary("cancel"))
4. user selects a component, new.item content changes (thumbnail | node-id, button.primary("Continue") | button.secondary("cancel"))
5. user clicks cancel -> new.item closes, task cancelled
6. user clicks continue -> edit entry metadata replaces new.item contents (thumbnail | node-id, form(label: name, figma_layer/component_name) form(label: comments, comment field) button.container.row(button.secondary("cancel") | button.secondary("copy & cancel") | button.primary("Queue")))
7. User cancels / copy & cancel (copy and cancel = the `entry` schema is just copied to the users clipboard instead of added to the queue)
8. User clicks `Queue` = add_queue_item to API ~> saves to `figma-tasks.json` and new.item closes
9. `queue.component now displays the entry from `figma-tasks.json`
10. ...
```


## Notes
- the user can accumulate job tickets, clear them all, copy them all to clipboard, but primary usage is copilot can read from `figma-tasks.json` in the repo root / docs folder, complete the tasks, and flip the status to like, `review`. But we can handle that later.
- not really sure how to fetch component / layer thumbnails in figma. /v1/images/{file_id} api endpoint? We don't need to store the thumbnail, presumably, we just need to populate it from node-id's in the tasks, fully locally to the plugin everytime it restarts or whatever. I know it's possible, image export plugins do it, just don't know how.