#include "transcriptionpipeline.h"
#include <QPlainTextEdit>   // ← add
#include <QComboBox>        // ← add
#include <QCheckBox>        // ← add
#include <QFileInfo>
#include <QCoreApplication>
#include <QDir>
#include <QProcess>
#include <QTimer>
#include <QUrl>
#include <QFile>

TranscriptionPipeline::TranscriptionPipeline(
    QPlainTextEdit  *console,
    QComboBox       *model,
    QComboBox       *language,
    QCheckBox       *txtCheckbox,
    QCheckBox       *srtCheckbox,
    QCheckBox       *cpuCheckbox,
    QCheckBox       *openCheckbox,
    QPlainTextEdit  *arguments,
    QList<QProcess*> *processList,
    QObject *parent)
    : QObject(parent),
    console(console),
    model(model),
    language(language),
    txtCheckbox(txtCheckbox),
    srtCheckbox(srtCheckbox),
    cpuCheckbox(cpuCheckbox),
    openCheckbox(openCheckbox),
    arguments(arguments),
    processList(processList)
{}

/* ---------- public entry ---------- */
void TranscriptionPipeline::start(const QString &inputPath)
{
    QFileInfo fi(inputPath);
    if (inputPath.isEmpty() || !fi.exists()) {
        console->appendPlainText("Error: media file not found.");
        emit finished();
        return;
    }

    srcFile   = fi.absoluteFilePath();
    mp3File   = fi.absolutePath() + "/" + fi.completeBaseName() + ".mp3";
    outputTxt = mp3File + ".txt";

    console->appendPlainText("Input file: " + srcFile);

    (fi.suffix().compare("mp3", Qt::CaseInsensitive) == 0)
        ? checkModel()
        : convertToMp3();
}

/* ---------- step 1 : convert (128 kbps) ---------- */
void TranscriptionPipeline::convertToMp3()
{
    console->appendPlainText("Converting → 128 kbps MP3 …");
    QStringList args{ "-y", "-i", srcFile, "-b:a", "128k", mp3File };

    auto *p = new QProcess(this);
    processList->append(p);
    p->setProcessChannelMode(QProcess::MergedChannels);

    connect(p, &QProcess::readyRead,
            this, [=]{ console->appendPlainText(QString::fromLocal8Bit(p->readAll())); });

    connect(p, QOverload<int,QProcess::ExitStatus>::of(&QProcess::finished),
            this, [=](int code, QProcess::ExitStatus st){
                processList->removeOne(p);  p->deleteLater();
                if (st==QProcess::NormalExit && code==0) {
                    console->appendPlainText("FFmpeg OK.");
                    checkModel();
                } else {
                    console->appendPlainText("FFmpeg failed.");
                    emit finished();
                }
            });
    p->start("ffmpeg", args);
}

/* ---------- step 2 : ensure model ---------- */
void TranscriptionPipeline::checkModel()
{
    const QString modelFile = "ggml-" + model->currentText() + ".bin";
    const QString modelsDir = QCoreApplication::applicationDirPath() + "/models/";
    const QString modelPath = modelsDir + modelFile;

    QDir().mkpath(modelsDir);

    if (QFile::exists(modelPath)) {
        console->appendPlainText("Model OK: " + modelFile);
        runWhisper();
        return;
    }

    console->appendPlainText("Downloading model …");
    const QString url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + modelFile;

    auto *p = new QProcess(this);
    processList->append(p);
    p->setProcessChannelMode(QProcess::MergedChannels);

    connect(p, &QProcess::readyRead,
            this, [=]{ console->appendPlainText(QString::fromLocal8Bit(p->readAll())); });

    connect(p, QOverload<int,QProcess::ExitStatus>::of(&QProcess::finished),
            this, [=](int code, QProcess::ExitStatus st){
                processList->removeOne(p);  p->deleteLater();
                if (st==QProcess::NormalExit && code==0 && QFileInfo(modelPath).size() > 1'000'000) {
                    console->appendPlainText("Model download OK.");
                    runWhisper();
                } else {
                    console->appendPlainText("Model download failed.");
                    QFile::remove(modelPath);
                    emit finished();
                }
            });
    p->start("curl", { "-L", url, "-o", modelPath });
}

/* ---------- step 3 : whisper ---------- */
void TranscriptionPipeline::runWhisper()
{
    const QString exeDir = QCoreApplication::applicationDirPath();
    const QString modelPath = exeDir + "/models/ggml-" + model->currentText() + ".bin";
    const QString whisperExe = exeDir + "/whisper-cli.exe";

    QStringList cmd{
        "-m", modelPath,
        "-f", mp3File,
        (txtCheckbox->isChecked()? "-otxt" : ""),
        (srtCheckbox->isChecked()? "-osrt" : ""),
        (cpuCheckbox->isChecked()? "--no-gpu" : ""),
        "-l", language->currentText()
    };
    cmd += QProcess::splitCommand(arguments->toPlainText());

    console->appendPlainText("Running whisper-cli …");

    auto *p = new QProcess(this);
    processList->append(p);
    p->setProcessChannelMode(QProcess::MergedChannels);

    connect(p, &QProcess::readyRead,
            this, [=]{ console->appendPlainText(QString::fromLocal8Bit(p->readAll())); });

    connect(p, QOverload<int,QProcess::ExitStatus>::of(&QProcess::finished),
            this, [=](int code, QProcess::ExitStatus st){
                processList->removeOne(p);  p->deleteLater();

                if (st==QProcess::NormalExit && code==0) {
                    console->appendPlainText("Whisper DONE.");
                    if (txtCheckbox->isChecked() && openCheckbox->isChecked())
                        QTimer::singleShot(1500, [=]{ QProcess::startDetached("notepad.exe", { outputTxt }); });
                } else {
                    console->appendPlainText("Whisper failed.");
                }
                emit finished();
            });
    p->start(whisperExe, cmd);
}
