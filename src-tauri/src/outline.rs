use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SectionLevel {
    Part,
    Chapter,
    Section,
    Subsection,
    Subsubsection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutlineItem {
    pub id: String,
    pub title: String,
    pub level: SectionLevel,
    pub file: String,
    pub start: usize,
    pub end: usize,
    pub display: String,
}

pub fn navigation_id(file: &str, start: usize, end: usize) -> String {
    let safe: String = file
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' || character == '-' {
                character
            } else {
                '-'
            }
        })
        .collect();
    format!("node-{safe}-{start}-{end}")
}

pub fn extract_outline(files: &[(String, String)]) -> Vec<OutlineItem> {
    let mut result = Vec::new();
    for (file, source) in files {
        let (body, base) = document_body(source);
        let mut offset = 0;
        for line in body.split_inclusive('\n') {
            let trimmed = line.trim_start();
            if !trimmed.starts_with('%') {
                for (command, level) in [
                    ("\\subsubsection{", SectionLevel::Subsubsection),
                    ("\\subsection{", SectionLevel::Subsection),
                    ("\\section{", SectionLevel::Section),
                    ("\\chapter{", SectionLevel::Chapter),
                    ("\\part{", SectionLevel::Part),
                ] {
                    if let Some(command_start) = line.find(command) {
                        let title_start = command_start + command.len();
                        if let Some(close) = line[title_start..].find('}') {
                            let start = base + offset + command_start;
                            let end = base + offset + title_start + close + 1;
                            result.push(OutlineItem {
                                id: navigation_id(file, start, end),
                                title: line[title_start..title_start + close].to_string(),
                                level,
                                file: file.clone(),
                                start,
                                end,
                                display: String::new(),
                            });
                        }
                        break;
                    }
                }
            }
            offset += line.len();
        }
    }
    let mut numbers = [0_u32; 5];
    for item in &mut result {
        let level = level_rank(item.level) as usize;
        numbers[level] += 1;
        for value in numbers.iter_mut().skip(level + 1) {
            *value = 0;
        }
        let prefix = numbers[..=level]
            .iter()
            .filter(|value| **value > 0)
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(".");
        item.display = format!("{prefix} {}", item.title);
    }
    result
}

pub fn rename_section(source: &str, item: &OutlineItem, title: &str) -> Result<String, String> {
    let open = source[item.start..item.end]
        .find('{')
        .ok_or("invalid section")?
        + item.start
        + 1;
    let mut updated = source.to_string();
    updated.replace_range(open..item.end - 1, &escape_title(title));
    Ok(updated)
}

pub fn add_section(source: &str, item: &OutlineItem, title: &str) -> Result<String, String> {
    let command = match item.level {
        SectionLevel::Part => "part",
        SectionLevel::Chapter => "chapter",
        SectionLevel::Section => "section",
        SectionLevel::Subsection => "subsection",
        SectionLevel::Subsubsection => "subsubsection",
    };
    let insertion = format!("\\{command}{{{}}}\n", escape_title(title));
    let insertion_at = source[item.end..]
        .match_indices('\n')
        .map(|(offset, _)| item.end + offset + 1)
        .find(|offset| {
            let line = source[*offset..]
                .lines()
                .next()
                .unwrap_or_default()
                .trim_start();
            [
                "\\part{",
                "\\chapter{",
                "\\section{",
                "\\subsection{",
                "\\subsubsection{",
            ]
            .iter()
            .enumerate()
            .any(|(rank, marker)| line.starts_with(marker) && rank as u8 <= level_rank(item.level))
        })
        .unwrap_or(source.len());
    let mut updated = source.to_string();
    let prefix = if insertion_at > 0 && !source[..insertion_at].ends_with('\n') {
        "\n"
    } else {
        ""
    };
    updated.insert_str(insertion_at, &format!("{prefix}{insertion}"));
    Ok(updated)
}

pub fn delete_section(
    source: &str,
    item: &OutlineItem,
    all: &[OutlineItem],
) -> Result<String, String> {
    let end = all
        .iter()
        .filter(|next| next.start > item.start && level_rank(next.level) <= level_rank(item.level))
        .map(|next| next.start)
        .min()
        .unwrap_or(source.len());
    let start = line_start(source, item.start);
    let mut updated = source.to_string();
    updated.replace_range(start..end, "");
    Ok(updated)
}

fn level_rank(level: SectionLevel) -> u8 {
    match level {
        SectionLevel::Part => 0,
        SectionLevel::Chapter => 1,
        SectionLevel::Section => 2,
        SectionLevel::Subsection => 3,
        SectionLevel::Subsubsection => 4,
    }
}
fn line_start(source: &str, offset: usize) -> usize {
    source[..offset]
        .rfind('\n')
        .map(|position| position + 1)
        .unwrap_or(0)
}
fn escape_title(title: &str) -> String {
    title
        .replace('\\', "\\textbackslash{}")
        .replace('{', "\\{")
        .replace('}', "\\}")
}

fn document_body(source: &str) -> (&str, usize) {
    match (
        source.find("\\begin{document}"),
        source.rfind("\\end{document}"),
    ) {
        (Some(begin), Some(end)) if begin < end => {
            let start = begin + "\\begin{document}".len();
            (&source[start..end], start)
        }
        _ => (source, 0),
    }
}
