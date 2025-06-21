#ifndef TRANSCRIPTIONPIPELINE_H
#define TRANSCRIPTIONPIPELINE_H

#include <QObject>
#include <QProcess>
#include <QPlainTextEdit>
#include <QComboBox>
#include <QCheckBox>
#include <QPlainTextEdit>
#include <QList>

class TranscriptionPipeline : public QObject
{
    Q_OBJECT
public:
    explicit TranscriptionPipeline(
        QPlainTextEdit *console,
        QComboBox *model,
        QComboBox *language,
        QCheckBox *txtCheckbox,
        QCheckBox *srtCheckbox,
        QCheckBox *cpuCheckbox,
        QPlainTextEdit *arguments,
        QList<QProcess*> *processList,
        QObject *parent = nullptr);

    void start(const QString &inputFilePath);

signals:
    void finished();

private:
    QPlainTextEdit *console;
    QComboBox *model;
    QComboBox *language;
    QCheckBox *txtCheckbox;
    QCheckBox *srtCheckbox;
    QCheckBox *cpuCheckbox;
    QPlainTextEdit *arguments;
    QList<QProcess*> *processList;
    QString m_filePath;
};

#endif // TRANSCRIPTIONPIPELINE_H
