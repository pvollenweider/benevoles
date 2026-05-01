FROM golang:1.21-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o webhook .

FROM alpine:3.19
COPY --from=builder /build/webhook /webhook
ENTRYPOINT ["/webhook"]
