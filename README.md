# cc-vietnamese

Fix Vietnamese input in Claude Code CLI — tự động patch cả bản npm lẫn native binary.

## Install

```bash
npx github:thotran113254/claude-code-vietnamese install
```

Chỉ 1 lệnh. Tự detect npm hay native binary, patch hết. Xong.

## Sau khi Claude update

```bash
npx github:thotran113254/claude-code-vietnamese fix
```

## Vấn đề gì?

Vietnamese IME (Unikey, OpenKey, EVKey, macOS Vietnamese Input) gửi backspace + ký tự thay thế khi gõ dấu. Claude Code xử lý xong backspace thì return luôn, mất ký tự thay thế.

```
Gõ "việt": v → i → e [DEL] ê → t [DEL] ệ → t
Claude Code gốc: nhận DEL, bỏ ê → sai
Sau patch: xử lý từng ký tự, DEL=xóa, còn lại=chèn → đúng
```

## Commands

| Command | Mô tả |
|---|---|
| `cc-vietnamese install` | Patch Vietnamese IME fix |
| `cc-vietnamese fix` | Re-patch sau khi Claude update |
| `cc-vietnamese update` | Chạy `claude update` + re-patch |
| `cc-vietnamese uninstall` | Gỡ patch, khôi phục bản gốc |
| `cc-vietnamese status` | Kiểm tra trạng thái patch |

## Hỗ trợ

- **Cài đặt**: npm (`cli.js`) + native binary (Node.js SEA tại `~/.local/share/claude/versions/`)
- **IME**: Unikey, OpenKey, EVKey, macOS Vietnamese Input
- **Kiểu gõ**: Telex, VNI, VIQR
- **OS**: Windows, Linux, macOS

## Troubleshooting

```bash
# Kiểm tra trạng thái
cc-vietnamese status

# Gõ tiếng Việt vẫn lỗi sau update
cc-vietnamese fix

# Lỗi permission → chạy với quyền phù hợp với thư mục cài Claude Code
```

## Credits

Inspired by [claude-code-vime](https://github.com/trancong12102/claude-code-vime) by [@trancong12102](https://github.com/trancong12102).

Original project by [@quangpl](https://github.com/quangpl/claude-code-vietnamese).

## License

MIT
