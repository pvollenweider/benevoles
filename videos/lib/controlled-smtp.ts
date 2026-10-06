// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Minimal plaintext SMTP fixture, loopback only; never a deployable mail server. */
import { createServer, type Socket } from "node:net"
import nodemailer from "nodemailer"

export async function controlledSmtp(port = 41028) {
  if (port !== 41028) throw new Error("Only the dedicated local SMTP fixture port is allowed")
  const rejected = new Set<string>()
  const attempts: { recipient: string; accepted: boolean; timestamp: string }[] = []
  const sockets = new Set<Socket>()
  const forward = nodemailer.createTransport({ host: "127.0.0.1", port: 41026, secure: false, connectionTimeout: 5000, socketTimeout: 10000 })
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => undefined)
    socket.setTimeout(15000, () => socket.destroy())
    socket.write("220 localhost video SMTP fixture\r\n")
    let buffer = "", data = false, body: string[] = [], from = "", recipients: string[] = [], delivering = false
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8")
      if (buffer.length > 256000) { socket.destroy(); return }
      let end: number
      while (!delivering && (end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        if (data) {
          if (line !== ".") { body.push(line.startsWith("..") ? line.slice(1) : line); if (body.join("\r\n").length > 256000) socket.destroy(); continue }
          data = false; delivering = true
          const raw = body.join("\r\n"); body = []
          void forward.sendMail({ envelope: { from, to: recipients }, raw }).then(() => socket.write("250 accepted by local Mailpit\r\n"), () => socket.write("451 local Mailpit forwarding failed\r\n")).finally(() => { delivering = false })
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write("250-localhost\r\n250 SIZE 256000\r\n")
        else if (/^MAIL FROM:/i.test(line)) { from = /<([^>]*)>/.exec(line)?.[1] ?? ""; recipients = []; socket.write("250 sender accepted\r\n") }
        else if (/^RCPT TO:/i.test(line)) {
          const recipient = /<([^>]*)>/.exec(line)?.[1] ?? ""
          if (!/^video\.delivery\.[a-z0-9.-]+@example\.org$/.test(recipient)) { socket.write("550 fixture recipient outside allowlist\r\n"); continue }
          const accepted = !rejected.has(recipient)
          attempts.push({ recipient, accepted, timestamp: new Date().toISOString() })
          if (accepted) { recipients.push(recipient); socket.write("250 recipient accepted\r\n") }
          else socket.write("550 5.1.1 Synthetic recipient rejected for video training\r\n")
        } else if (line.toUpperCase() === "DATA") {
          if (!recipients.length) socket.write("503 no accepted recipient\r\n")
          else { data = true; body = []; socket.write("354 end with dot\r\n") }
        } else if (line.toUpperCase() === "RSET") { recipients = []; body = []; data = false; socket.write("250 reset\r\n") }
        else if (line.toUpperCase() === "QUIT") socket.end("221 goodbye\r\n")
        else if (line.toUpperCase() === "NOOP") socket.write("250 OK\r\n")
        else socket.write("502 command unsupported by local video fixture\r\n")
      }
    })
  })
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve) })
  return { rejected, attempts, close: async () => { for (const socket of sockets) socket.destroy(); forward.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) } }
}
