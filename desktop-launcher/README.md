# 桌面启动器

桌面启动器用于在电脑上快速打开云端「TikTok 巴西选品协同」系统。

> 说明：打包后的 exe 体积较大，**不纳入仓库**，请按下面步骤从源码自行构建。

## 从源码构建
需要 Python 3.10+，并安装依赖：

```
pip install qrcode pillow pyinstaller
pyinstaller --noconfirm "TikTok选品启动器.spec"
```

- 源码入口：`launcher.py`
- 打包配置：`TikTok选品启动器.spec`
- 产物：`dist/TikTok选品启动器.exe`

## 使用
构建后双击 exe：

- **打开选品系统**：用默认浏览器打开云端页面
- **复制链接**：一键复制网址，可发给手机
- **二维码**：手机扫码直接进入，支持多台手机协同

云端系统数据实时同步，任何网络（含与电脑不同网络）都可用，刷新不丢数据。
