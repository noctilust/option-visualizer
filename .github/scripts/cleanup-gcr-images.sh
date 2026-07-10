#!/bin/sh

set -eu

image="${1:?Container image repository is required}"
retain_count="${2:-2}"

case "$retain_count" in
  ''|*[!0-9]*)
    echo "Retention count must be a non-negative integer: $retain_count" >&2
    exit 1
    ;;
esac

image_json="$(
  gcloud container images list-tags "$image" \
    --limit=999 \
    --sort-by=~timestamp \
    --format=json
)"

if ! printf '%s' "$image_json" | \
  jq -e 'all(.[]; (.digest | test("^sha256:[0-9a-f]{64}$")))' >/dev/null; then
  echo "Refusing to delete malformed image digests." >&2
  exit 1
fi

image_count="$(printf '%s' "$image_json" | jq 'length')"
obsolete_digests="$(
  printf '%s' "$image_json" | \
    jq -r --argjson retain "$retain_count" '.[$retain:] | .[].digest'
)"

if [ -z "$obsolete_digests" ]; then
  echo "No obsolete images to delete (${image_count} retained)."
  exit 0
fi

echo "Retaining the ${retain_count} newest images."
printf '%s\n' "$obsolete_digests" | while IFS= read -r digest; do
  if [ "${DRY_RUN:-false}" = "true" ]; then
    echo "Would delete obsolete image: ${image}@${digest}"
    continue
  fi

  echo "Deleting obsolete image: ${image}@${digest}"
  gcloud container images delete \
    "${image}@${digest}" \
    --force-delete-tags \
    --quiet
done
