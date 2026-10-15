# 桌面启动器

双击 **TikTok选品启动器.exe** 即可在电脑上打开云端「TikTok 巴西选品协同」系统。

## 功能
- **打开选品系统**：用默认浏览器打开云端页面
- **复制链接**：一键复制网址，可发给手机
- **二维码**：手机扫码直接进入，支持多台手机协同

云端系统数据实时同步，任何网络（含与电脑不同网络）都可用，刷新不丢数据。

## 从源码构建
需要 Python 3.10+，并安装依赖：

```
pip install qrcode pillow pyinstaller
pyinstaller --noconfirm "TikTok选品启动器.spec"
```

- 源码入口：`launcher.py`
- 打包配置：`TikTok选品启动器.spec`
- 产物：`dist/TikTok选品启动器.exe`
