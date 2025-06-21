#pragma once
#include <QObject>

class QPlainTextEdit;
class QComboBox;
class QCheckBox;
class QProcess;
template <typename T> class QList;

class TranscriptionPipeline : public QObject
{
    Q_OBJECT
public:
    explicit TranscriptionPipeline(
        QPlainTextEdit  *console,
        QComboBox       *model,
        QComboBox       *language,
        QCheckBox       *txtCheckbox,
        QCheckBox       *srtCheckbox,
        QCheckBox       *cpuCheckbox,
        QPlainTextEdit  *arguments,
        QList<QProcess*> *processList,
        QObject *parent = nullptr);

    void start(const QString &inputPath);

signals:
    void finished();

private:
    /* ordered helper steps */
    void convertToMp3();
    void checkModel();
    void runWhisper();

    /* UI / state pointers (live widgets) */
    QPlainTextEdit  *console;
    QComboBox       *model;
    QComboBox       *language;
    QCheckBox       *txtCheckbox;
    QCheckBox       *srtCheckbox;
    QCheckBox       *cpuCheckbox;
    QPlainTextEdit  *arguments;
    QList<QProcess*> *processList;

    /* per-job filenames */
    QString srcFile;      // original
    QString mp3File;      // converted
    QString outputTxt;    // mp3File + ".txt"
};
