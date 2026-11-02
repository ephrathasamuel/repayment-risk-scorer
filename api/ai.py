"""A short write-up of a decision for the credit officer, by Claude.

Claude only explains values the model has already produced; it is told not to
add numbers or change the decision.
"""

import json
import os

# The anthropic SDK is imported only when a summary is requested: it is a large
# package and loading it at start-up would slow down every API start.

MODEL = "claude-opus-5-5"
LANGUAGES = {"en": "English", "am": "Amharic"}

SYSTEM_PROMPT = """You write short decision notes for credit officers.

You receive one credit decision produced by a machine-learning model: the probability of default, score, risk band, recommendation, the factors that pushed the risk up or down (SHAP contributions in log-odds; positive means higher risk), each factor's value next to a typical value, and an illustrative limit and price.

Rules:
- Use only the numbers given. Do not invent, recalculate or estimate new figures, and do not change the recommendation.
- Plain, professional language for a loan officer, not a data scientist. Do not mention log-odds or SHAP by name; say "pushed the risk up" or "lowered the risk".
- Structure: one opening line with the recommendation, band and probability; then the headings "Main risk factors:", "Points in the borrower's favour:", "What to check before deciding:". Two to four lines starting with "- " under each heading.
- "What to check before deciding" lists practical documents or questions for the borrower that relate to the factors.
- Say once that the limit and price come from illustrative rules.
- Plain text only, no markdown other than the "- " at the start of lines."""


class AiError(Exception):
    pass


def ai_available():
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def summarise(decision, language="en", client=None):
    if language not in LANGUAGES:
        language = "en"
    if client is None:
        import anthropic
        client = anthropic.Anthropic()
    payload = {
        "probability_of_default": decision["probability"],
        "score": decision["score"],
        "band": decision["band"],
        "recommendation": decision["recommendation"],
        "model_version": decision["model_version"],
        "top_factors": decision["contributions"][:8],
        "illustrative_offer": decision["offer"],
    }
    user = (f"Write the note in {LANGUAGES[language]}.\n\nDecision (JSON):\n"
            + json.dumps(payload, ensure_ascii=False, indent=1))
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "medium"},
            # If the model declines, the API retries on Anthropic's recommended fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except Exception as exc:
        raise _friendly_error(exc) from exc

    if response.stop_reason == "refusal":
        raise AiError("The AI declined to summarise this decision. The decision itself is unaffected.")
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise AiError("The AI returned an empty summary. Try again.")
    return {"text": text, "model": response.model, "language": LANGUAGES[language]}


def _friendly_error(exc):
    import anthropic

    if isinstance(exc, anthropic.AuthenticationError):
        return AiError("The AI key was rejected. Check ANTHROPIC_API_KEY in .env.")
    if isinstance(exc, anthropic.RateLimitError):
        return AiError("The AI service is busy. Try again in a minute.")
    if isinstance(exc, anthropic.APIConnectionError):
        return AiError("Could not reach the AI service.")
    if isinstance(exc, anthropic.APIStatusError):
        return AiError(f"The AI service returned an error ({exc.status_code}).")
    return AiError("The AI summary failed unexpectedly. The decision itself is unaffected.")
