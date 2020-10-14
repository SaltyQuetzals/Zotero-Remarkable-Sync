import argparse
import os
import pathlib
import subprocess
import logging

import requests
from pyzotero import zotero as pyzotero

DEFAULT_REMARKABLE_DIR_NAME = "Zotero"
DEFAULT_DOWNLOAD_DIR_NAME = "tmp"

logging.basicConfig(level=logging.INFO)


def build_tree(collections):
    """
    Takes a group of Zotero collections (each of which has "parent" collection references) and converts them into a tree structure.
    """
    nodes = {}
    for collection in collections:
        key = collection["key"]
        parent = collection["data"]["parentCollection"]
        nodes[key] = collection

    forest = []
    for collection in collections:
        key = collection["key"]
        parent_key = collection["data"]["parentCollection"]
        node = nodes[key]

        # make node a new tree or link to parent
        if parent_key == None:
            forest.append(node)
        else:
            parent = nodes[parent_key]
            if not "children" in parent:
                parent["children"] = []
            children = parent["children"]
            children.append(node)
    assert len(forest) == 1
    return forest[0]


def remarkable_mkdir(dirpath: str) -> None:
    """
    Runs "mkdir" on the ReMarkable Tablet.
    """
    logging.debug(f"Attempting to create the directory {dirpath} on the ReMarkable.")
    subprocess.run(f'rmapi mkdir "{dirpath}"', shell=True, stdout=subprocess.DEVNULL)


def remarkable_exists(path: str) -> bool:
    """
    Checks to see if a file/folder exists on the ReMarkable tablet.
    """
    try:
        logging.debug(f"Attempting to see if {path} exists on ReMarkable.")
        subprocess.check_call(
            f'rmapi stat "{path}"',
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def remarkable_upload_file(filepath: pathlib.Path, dest_dir: str) -> None:
    """
    Uploads a file to the ReMarkable tablet.
    """
    logging.debug(f"Uploading {str(filepath)} to {dest_dir} on the ReMarkable.")
    subprocess.run(
        f'rmapi put "{filepath}" "{dest_dir}"',
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def fetch_attachment(destination_dir: str, item, filename: str, zotero_api_key: str):
    """
    Workaround for the failing pyzotero.Zotero.dump function. This seems to work pretty consistently.
    """
    logging.info(f'Downloading {filename} to "{destination_dir}" locally.')
    if "attachment" in item["links"]:
        href = item["links"]["attachment"]["href"]
        r = requests.get(f"{href}/file?key={zotero_api_key}")
        r.raise_for_status()
        with open(os.path.join(destination_dir, filename), "wb+") as f:
            f.write(r.content)


def upload_new_papers_from_zotero(
    collection_name: str,
    items,
    remarkable_dirpath: str,
    tmp_download_dir: str,
    zotero_api_key: str,
):
    collection_dir = os.path.join(tmp_download_dir, collection_name)
    logging.debug(f"Creating {collection_dir} locally.")
    pathlib.Path(collection_dir).mkdir(parents=True, exist_ok=True)
    for item in items:
        filename = f'{item["data"]["title"]}.pdf'

        remarkable_dest_path = pathlib.Path(os.path.join(remarkable_dirpath, filename))
        if remarkable_exists(str(remarkable_dest_path)):
            logging.debug(
                f"{remarkable_dest_path} exists already. Skipping download/upload process."
            )
            continue

        fetch_attachment(collection_dir, item, filename, zotero_api_key)
        download_path = pathlib.Path(os.path.join(collection_dir, filename))
        remarkable_upload_file(
            download_path,
            remarkable_dirpath,
        )


def process_node(
    zotero: pyzotero.Zotero,
    subtree,
    dirpath: str,
    tmp_download_dir: str,
):
    collection_name: str = subtree["data"]["name"]
    logging.info(f"Syncing {collection_name} from Zotero to ReMarkable.")
    new_dir_name = os.path.join(dirpath, collection_name)
    if not remarkable_exists(new_dir_name):
        remarkable_mkdir(new_dir_name)

    # Don't try and upload papers for the dummy root node.
    key = subtree["key"]
    if key != False:
        items = zotero.collection_items_top(key)
        upload_new_papers_from_zotero(
            collection_name, items, new_dir_name, tmp_download_dir, zotero.api_key
        )

    if "children" not in subtree:
        # Don't try and process children of leaf nodes.
        return

    # Recurse
    for child in subtree["children"]:
        process_node(zotero, child, new_dir_name, tmp_download_dir)


def process_library(
    zotero: pyzotero.Zotero,
    remarkable_root_dir: str,
    tmp_download_dir: str,
):
    if not remarkable_exists(remarkable_root_dir):
        remarkable_mkdir(remarkable_root_dir)

    collections = zotero.collections()
    dummy_root_node = {
        "data": {"parentCollection": None, "name": "Ubicomp"},
        "key": False,
    }

    collections.append(dummy_root_node)
    tree = build_tree(collections)
    process_node(zotero, tree, remarkable_root_dir, tmp_download_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "API_KEY",
        help="Your personal Zotero API key. Create an API Key at https://www.zotero.org/settings/keys.",
        type=str,
    )
    parser.add_argument(
        "LIBRARY_ID",
        help="The ID of the library you're hoping to sync. Can be obtained from https://zotero.org/<YOUR_USERNAME>, and clicking on the relevant group. The URL should then be https://www.zotero.org/groups/<GROUP_ID>",
    )
    parser.add_argument(
        "LIBRARY_TYPE",
        help='Either "group" for group libraries, or "user" for user libraries.',
        type=str,
        choices=["group", "user"],
    )
    parser.add_argument(
        "--remarkable_root_dir_name",
        help='The root directory to download the Zotero library to on the ReMarkable tablet. Default is "Zotero".',
        default=DEFAULT_REMARKABLE_DIR_NAME,
    )
    parser.add_argument(
        "--tmp_download_dir_name",
        help='The directory to download PDFs to. Default is "tmp".',
        default=DEFAULT_DOWNLOAD_DIR_NAME,
    )
    args = parser.parse_args()

    zotero = pyzotero.Zotero(args.LIBRARY_ID, args.LIBRARY_TYPE, args.API_KEY)

    logging.info("Beginning sync...")
    process_library(zotero, args.remarkable_root_dir_name, args.tmp_download_dir_name)
    logging.info("Sync complete.")