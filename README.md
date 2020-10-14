# Zotero -> Remarkable Sync
This little script will sync a Zotero library to your ReMarkable tablet.

**You'll need to install [`rmapi`](https://github.com/juruen/rmapi) to use this.**

## Getting Started
0. Install [`rmapi`](https://github.com/juruen/rmapi)
0. Run `rmapi` to authorize it to interact with your ReMarkable tablet.
0. Get the values you'll need for the command-line arguments:
    0. The API key: https://www.zotero.org/settings/keys
    0. The library ID can be obtained from `https://zotero.org/<YOUR_USERNAME>`, and clicking on the relevant group. The URL should then be `https://www.zotero.org/groups/<GROUP_ID>`
    0. What kind of library it is: Either `"group"` for group libraries, or `"user"` for user libraries.
    0. There are other arguments taken by the utility, but those are more for internal customization/naming on-device.
0. `pip install requirements.txt`
0. `python updated_sync <your values>`.