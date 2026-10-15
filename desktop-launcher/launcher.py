# -*- coding: utf-8 -*-
import os, sys, webbrowser
import tkinter as tk
from tkinter import messagebox

try:
    import qrcode
    from PIL import ImageTk
except Exception:
    qrcode = None

URL = 'https://4kv5z3fu91tay.doubaoapps.com/app/app_17fyhnpndzq'


class App:
    def __init__(self, root):
        self.root = root
        self.qr_img = None
        root.title('TikTok 巴西选品协同')
        root.geometry('440x640')
        root.configure(bg='#f4f5f7')

        tk.Label(root, text='TikTok 巴西选品协同', font=('Microsoft YaHei', 18, 'bold'),
                 bg='#f4f5f7', fg='#191c23').pack(pady=(20, 2))
        tk.Label(root, text='点击打开 / 手机扫码，任何网络都能用', font=('Microsoft YaHei', 11),
                 bg='#f4f5f7', fg='#6b7280').pack()

        tk.Button(root, text='打开选品系统', font=('Microsoft YaHei', 15, 'bold'),
                  bg='#fe2c55', fg='#ffffff', activebackground='#e0264b', activeforeground='#ffffff',
                  relief='flat', height=2, width=22, command=self.open_url).pack(pady=18)

        box = tk.Frame(root, bg='#191c23')
        tk.Label(box, text=URL, font=('Consolas', 10), bg='#191c23', fg='#25f4ee',
                 wraplength=384, padx=12, pady=8, justify='center').pack()
        box.pack(padx=20, fill='x')

        tk.Button(root, text='复制链接', font=('Microsoft YaHei', 11),
                  bg='#191c23', fg='#ffffff', activebackground='#000000', activeforeground='#ffffff',
                  relief='flat', width=12, command=self.copy_url).pack(pady=10)

        self.qr_lbl = tk.Label(root, bg='#f4f5f7')
        self.qr_lbl.pack(pady=4)
        self.make_qr()

        tk.Label(root, text='手机扫这个二维码直接进入', font=('Microsoft YaHei', 10),
                 bg='#f4f5f7', fg='#6b7280').pack(pady=(2, 0))

    def open_url(self):
        webbrowser.open(URL)

    def copy_url(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(URL)
        self.root.update()
        messagebox.showinfo('已复制', '链接已复制，可发给手机。')

    def make_qr(self):
        if qrcode is None:
            return
        qr = qrcode.QRCode(border=2, box_size=6)
        qr.add_data(URL)
        qr.make(fit=True)
        img = qr.make_image(fill_color='#191c23', back_color='white').convert('RGB')
        self.qr_img = ImageTk.PhotoImage(img.resize((228, 228)))
        self.qr_lbl.config(image=self.qr_img)


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == '__main__':
    main()
