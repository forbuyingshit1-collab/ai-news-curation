# Use scheduled orchestration for content filtering

The system will collect raw items as they become available, but the main agent will run AI filtering and ranking in controlled review cycles rather than letting sub-agents evaluate independently in real time. This keeps the system easier to debug, makes API and LLM cost more predictable, and still allows timely updates from approved sources.
