-- expense_details copied raw_text and parsed_metadata that every writer also stores on expenses, and nothing read it;
-- rows of deleted expenses were left behind in it. See docs/systems/money.md.
DROP TABLE `expense_details`;
