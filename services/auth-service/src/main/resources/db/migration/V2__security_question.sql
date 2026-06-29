-- Self-serve password recovery via a security question.
ALTER TABLE app_user
    ADD COLUMN security_question    VARCHAR(255),
    ADD COLUMN security_answer_hash VARCHAR(100);
