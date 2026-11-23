#!/usr/bin/env bash
# 把构建出的 IPA 上传到 Gitee 对应版本的发行版（App 内 iOS 更新指向它）
set -euo pipefail

REPO="lazy-voice-jmy/family-nas"
VERSION=$(python3 -c "import json;print(json.load(open('app.json'))['expo']['version'])")
echo "版本: $VERSION"

RID=$(curl -s "https://gitee.com/api/v5/repos/$REPO/releases/tags/v$VERSION?access_token=$GITEE_TOKEN" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))")
if [ -z "$RID" ]; then
  echo "Gitee 上没有 v$VERSION 发行版，跳过 IPA 上传"
  exit 0
fi
echo "release id: $RID"

# 删除旧的 .ipa 附件
curl -s "https://gitee.com/api/v5/repos/$REPO/releases/$RID/attach_files?access_token=$GITEE_TOKEN" \
  | python3 -c "
import json,sys
for a in json.load(sys.stdin):
    if a.get('name','').endswith('.ipa'):
        print(a['id'])" \
  | while read -r AID; do
      [ -n "$AID" ] && curl -s -X DELETE -o /dev/null \
        "https://gitee.com/api/v5/repos/$REPO/releases/$RID/attach_files/$AID?access_token=$GITEE_TOKEN"
    done

curl -s --max-time 600 -X POST \
  "https://gitee.com/api/v5/repos/$REPO/releases/$RID/attach_files" \
  -F "access_token=$GITEE_TOKEN" \
  -F "file=@family-nas-ios.ipa;filename=family-nas-v$VERSION.ipa" \
  -o gitee_ipa.json -w "上传 HTTP %{http_code}\n"

python3 -c "import json;print('IPA 地址:', json.load(open('gitee_ipa.json')).get('browser_download_url'))"
